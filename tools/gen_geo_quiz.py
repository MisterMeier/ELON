#!/usr/bin/env python3
"""Erzeugt die Daten für das Geografiespiel „Wo liegt was?“ (assets/geo/wlw/).

Quellen (alle frei nutzbar):
  - Natural Earth (gemeinfrei): Länder 50m/10m, Bundesländer 10m, Flüsse, Seen, Hauptstädte
    https://github.com/nvkelso/natural-earth-vector (Ordner geojson/)
  - GeoNames cities1000 (CC BY 4.0) über https://github.com/lutangar/cities.json
    für die Koordinaten deutscher und bayerischer Städte

Aufruf:  python3 tools/gen_geo_quiz.py <Ordner mit den geladenen GeoJSON-/JSON-Dateien>
Benötigte Dateien im Ordner:
  ne_10m_populated_places_simple.geojson, ne_50m_admin_0_countries.geojson, ne_10m_admin_0_countries.geojson,
  ne_10m_admin_1_states_provinces.geojson, ne_50m_rivers_lake_centerlines.geojson, ne_50m_lakes.geojson,
  ne_10m_rivers_lake_centerlines.geojson, ne_10m_rivers_europe.geojson, ne_10m_lakes.geojson,
  ne_10m_lakes_europe.geojson, lutangar.json (cities.json)

Keine Koordinate ist von Hand eingetragen: jede Frage wird über Name + Land in den Quellen gesucht,
sonst bricht das Skript ab. Von Hand gesetzt sind nur die Plätze der Kartenbeschriftungen (Meere, Nachbarländer).
"""
import json, math, os, sys

SRC = sys.argv[1] if len(sys.argv) > 1 else '.'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'geo', 'wlw')
os.makedirs(OUT, exist_ok=True)

def load(fn):
    with open(os.path.join(SRC, fn), encoding='utf-8') as f:
        return json.load(f)

# ---------------------------------------------------------------- Geometrie-Helfer
def dp(pts, tol):
    """Douglas-Peucker (iterativ)."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    st = [(0, len(pts) - 1)]
    while st:
        a, b = st.pop()
        ax, ay = pts[a]; bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy)
        best, bi = -1, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            d = abs(dy * px - dx * py + bx * ay - by * ax) / L if L else math.hypot(px - ax, py - ay)
            if d > best:
                best, bi = d, i
        if best > tol:
            keep[bi] = True
            st.append((a, bi)); st.append((bi, b))
    return [p for p, k in zip(pts, keep) if k]

def clip_ring(ring, bb):
    """Sutherland-Hodgman an einem Rechteck (w,s,e,n)."""
    w, s, e, n = bb
    def cl(pts, inside, inter):
        out = []
        for i in range(len(pts)):
            cur, prev = pts[i], pts[i - 1]
            ci, pi = inside(cur), inside(prev)
            if ci:
                if not pi: out.append(inter(prev, cur))
                out.append(cur)
            elif pi:
                out.append(inter(prev, cur))
        return out
    def ix(x):
        return lambda p, q: [x, p[1] + (q[1] - p[1]) * (x - p[0]) / (q[0] - p[0])]
    def iy(y):
        return lambda p, q: [p[0] + (q[0] - p[0]) * (y - p[1]) / (q[1] - p[1]), y]
    pts = ring[:-1] if ring and ring[0] == ring[-1] else ring
    for ins, it in ((lambda p: p[0] >= w, ix(w)), (lambda p: p[0] <= e, ix(e)), (lambda p: p[1] >= s, iy(s)), (lambda p: p[1] <= n, iy(n))):
        if not pts: break
        pts = cl(pts, ins, it)
    return pts

def clip_line(line, bb):
    """Linie am Rechteck abschneiden (grob: Punkte außerhalb trennen die Linie)."""
    w, s, e, n = bb
    out, cur = [], []
    for p in line:
        if w <= p[0] <= e and s <= p[1] <= n:
            cur.append(p)
        else:
            if len(cur) > 1: out.append(cur)
            cur = []
    if len(cur) > 1: out.append(cur)
    return out

def rnd(pts, dec):
    r = []
    for x, y in pts:
        q = [round(x, dec), round(y, dec)]
        if not r or r[-1] != q: r.append(q)
    return r

def ring_area(r):
    return abs(sum(r[i][0] * r[i - 1][1] - r[i - 1][0] * r[i][1] for i in range(len(r)))) / 2

def polys(geom):
    if not geom: return []
    if geom['type'] == 'Polygon': return [geom['coordinates']]
    if geom['type'] == 'MultiPolygon': return geom['coordinates']
    return []

def lines(geom):
    if not geom: return []
    if geom['type'] == 'LineString': return [geom['coordinates']]
    if geom['type'] == 'MultiLineString': return geom['coordinates']
    return []

def bbox_hit(coords, bb):
    w, s, e, n = bb
    xs = [c[0] for c in coords]; ys = [c[1] for c in coords]
    return not (max(xs) < w or min(xs) > e or max(ys) < s or min(ys) > n)

def shape(geom, tol, dec, bb=None, min_area=0.0):
    """Polygon(e) → Liste von Ringen [[lon,lat],…] (äußere Ringe und Löcher, gerade-ungerade-Regel)."""
    out = []
    for poly in polys(geom):
        for k, ring in enumerate(poly):
            if bb is not None:
                if not bbox_hit(ring, bb): continue
                ring = clip_ring(ring, bb)
                if len(ring) < 3: continue
            if k == 0 and ring_area(ring) < min_area: break
            r = rnd(dp(ring, tol), dec)
            if len(r) >= 3: out.append(r)
    return out

# ---------------------------------------------------------------- Quellen
places = [f['properties'] for f in load('ne_10m_populated_places_simple.geojson')['features']]
gn = load('lutangar.json')
c50 = load('ne_50m_admin_0_countries.geojson')['features']
c10 = load('ne_10m_admin_0_countries.geojson')['features']
adm1 = [f for f in load('ne_10m_admin_1_states_provinces.geojson')['features'] if f['properties'].get('adm0_a3') == 'DEU']

# Ländernamen auf Deutsch (Natural Earth NAME_DE), Gruppierung nach deutscher Sicht (ADM0_A3_DE)
CNAME = {}
for f in c50:
    p = f['properties']
    CNAME.setdefault(p['ADM0_A3_DE'], p['NAME_DE'])
    CNAME.setdefault(p['ADM0_A3'], p['NAME_DE'])
CNAME.update({'CZE': 'Tschechien', 'USA': 'USA', 'GBR': 'Großbritannien', 'COD': 'Demokratische Republik Kongo', 'COG': 'Republik Kongo',
              'KOR': 'Südkorea', 'PRK': 'Nordkorea', 'MKD': 'Nordmazedonien', 'SWZ': 'Eswatini', 'CIV': 'Elfenbeinküste', 'MMR': 'Myanmar',
              'BIH': 'Bosnien und Herzegowina', 'TLS': 'Osttimor', 'CAF': 'Zentralafrikanische Republik', 'DOM': 'Dominikanische Republik',
              'HKG': 'China (Hongkong)', 'KOS': 'Kosovo', 'SOL': 'Somalia', 'CYN': 'Zypern'})

def ne_place(name, a3):
    c = [p for p in places if p['adm0_a3'] == a3 and name in (p['name'], p['nameascii'], p['namealt'], p['ls_name'])]
    if len(c) > 1:
        c.sort(key=lambda p: -p['pop_max'])
    return c[0] if c else None

ISO2 = {f['properties']['ADM0_A3']: f['properties']['ISO_A2_EH'] for f in c50}
ISO2.update({'FRA': 'FR', 'NOR': 'NO', 'KOS': 'XK', 'HKG': 'HK'})

def gn_place(name, iso2, adm=None):
    c = [x for x in gn if x['country'] == iso2 and x['name'] == name and (adm is None or x['admin1'] == adm)]
    if len(c) != 1:
        raise SystemExit(f'GeoNames: {name} ({iso2}/{adm}) nicht eindeutig: {c[:4]}')
    return c[0]

def world_q(de, ne, a3, d, info=None, gname=None):
    p = ne_place(ne, a3)
    if p:
        ll = [round(p['longitude'], 4), round(p['latitude'], 4)]
    else:
        x = gn_place(gname or ne, ISO2[a3])
        ll = [round(float(x['lng']), 4), round(float(x['lat']), 4)]
    return {'n': de, 'll': ll, 'd': d, 'i': info if info is not None else CNAME.get(a3, '')}

BL = {'01': 'Baden-Württemberg', '02': 'Bayern', '03': 'Bremen', '04': 'Hamburg', '05': 'Hessen', '06': 'Niedersachsen',
      '07': 'Nordrhein-Westfalen', '08': 'Rheinland-Pfalz', '09': 'Saarland', '10': 'Schleswig-Holstein', '11': 'Brandenburg',
      '12': 'Mecklenburg-Vorpommern', '13': 'Sachsen', '14': 'Sachsen-Anhalt', '15': 'Thüringen', '16': 'Berlin'}

def de_q(de, d, adm, gname=None, show_bl=True):
    x = gn_place(gname or de, 'DE', adm)
    return {'n': de, 'll': [round(float(x['lng']), 4), round(float(x['lat']), 4)], 'd': d, 'i': BL[adm] if show_bl else ''}

# ---------------------------------------------------------------- Fragen
# Stufe d: 1 = leicht (bekannt), 2 = mittel, 3 = schwer
CAP = [  # Hauptstädte der Welt: (deutsch, Name in Natural Earth, Land, Stufe)
    ('Berlin', 'Berlin', 'DEU', 1), ('Paris', 'Paris', 'FRA', 1), ('London', 'London', 'GBR', 1), ('Rom', 'Rome', 'ITA', 1),
    ('Madrid', 'Madrid', 'ESP', 1), ('Wien', 'Vienna', 'AUT', 1), ('Moskau', 'Moscow', 'RUS', 1), ('Washington, D.C.', 'Washington,  D.C.', 'USA', 1),
    ('Ottawa', 'Ottawa', 'CAN', 1), ('Mexiko-Stadt', 'Mexico City', 'MEX', 1), ('Brasília', 'Brasília', 'BRA', 1), ('Buenos Aires', 'Buenos Aires', 'ARG', 1),
    ('Peking', 'Beijing', 'CHN', 1), ('Tokio', 'Tokyo', 'JPN', 1), ('Neu-Delhi', 'New Delhi', 'IND', 1), ('Canberra', 'Canberra', 'AUS', 1),
    ('Kairo', 'Cairo', 'EGY', 1), ('Athen', 'Athens', 'GRC', 1), ('Ankara', 'Ankara', 'TUR', 1), ('Warschau', 'Warsaw', 'POL', 1),
    ('Stockholm', 'Stockholm', 'SWE', 1), ('Oslo', 'Oslo', 'NOR', 1), ('Lissabon', 'Lisbon', 'PRT', 1), ('Bern', 'Bern', 'CHE', 1),
    ('Prag', 'Prague', 'CZE', 1), ('Seoul', 'Seoul', 'KOR', 1), ('Wellington', 'Wellington', 'NZL', 1), ('Nairobi', 'Nairobi', 'KEN', 1),
    ('Lima', 'Lima', 'PER', 2), ('Bogotá', 'Bogota', 'COL', 2), ('Santiago de Chile', 'Santiago', 'CHL', 2), ('Caracas', 'Caracas', 'VEN', 2),
    ('Havanna', 'Havana', 'CUB', 2), ('Teheran', 'Tehran', 'IRN', 2), ('Bagdad', 'Baghdad', 'IRQ', 2), ('Riad', 'Riyadh', 'SAU', 2),
    ('Bangkok', 'Bangkok', 'THA', 2), ('Hanoi', 'Hanoi', 'VNM', 2), ('Jakarta', 'Jakarta', 'IDN', 2), ('Manila', 'Manila', 'PHL', 2),
    ('Islamabad', 'Islamabad', 'PAK', 2), ('Kabul', 'Kabul', 'AFG', 2), ('Addis Abeba', 'Addis Ababa', 'ETH', 2), ('Abuja', 'Abuja', 'NGA', 2),
    ('Rabat', 'Rabat', 'MAR', 2), ('Algier', 'Algiers', 'DZA', 2), ('Tunis', 'Tunis', 'TUN', 2), ('Dakar', 'Dakar', 'SEN', 2),
    ('Accra', 'Accra', 'GHA', 2), ('Kinshasa', 'Kinshasa', 'COD', 2), ('Kiew', 'Kyiv', 'UKR', 2), ('Budapest', 'Budapest', 'HUN', 2),
    ('Dublin', 'Dublin', 'IRL', 2), ('Helsinki', 'Helsinki', 'FIN', 2), ('Kopenhagen', 'København', 'DNK', 2), ('Damaskus', 'Damascus', 'SYR', 2),
    ('Beirut', 'Beirut', 'LBN', 2), ('Amman', 'Amman', 'JOR', 2), ('Kuala Lumpur', 'Kuala Lumpur', 'MYS', 2), ('Singapur', 'Singapore', 'SGP', 2),
    ('Ulan-Bator', 'Ulaanbaatar', 'MNG', 2), ('Astana', 'Nur-Sultan', 'KAZ', 2), ('Quito', 'Quito', 'ECU', 2), ('Montevideo', 'Montevideo', 'URY', 2),
    ('Pretoria', 'Pretoria', 'ZAF', 2), ('Luanda', 'Luanda', 'AGO', 2), ('Abu Dhabi', 'Abu Dhabi', 'ARE', 2), ('Pjöngjang', 'Pyongyang', 'PRK', 2),
    ('Ouagadougou', 'Ouagadougou', 'BFA', 3), ('Bamako', 'Bamako', 'MLI', 3), ('Niamey', 'Niamey', 'NER', 3), ("N'Djamena", "N'Djamena", 'TCD', 3),
    ('Khartum', 'Khartoum', 'SDN', 3), ('Dodoma', 'Dodoma', 'TZA', 3), ('Kampala', 'Kampala', 'UGA', 3), ('Kigali', 'Kigali', 'RWA', 3),
    ('Lusaka', 'Lusaka', 'ZMB', 3), ('Harare', 'Harare', 'ZWE', 3), ('Maputo', 'Maputo', 'MOZ', 3), ('Windhuk', 'Windhoek', 'NAM', 3),
    ('Gaborone', 'Gaborone', 'BWA', 3), ('Antananarivo', 'Antananarivo', 'MDG', 3), ('Mogadischu', 'Mogadishu', 'SOM', 3), ('Nouakchott', 'Nouakchott', 'MRT', 3),
    ('Tripolis', 'Tripoli', 'LBY', 3), ('Asmara', 'Asmara', 'ERI', 3), ('Bischkek', 'Bishkek', 'KGZ', 3), ('Taschkent', 'Tashkent', 'UZB', 3),
    ('Duschanbe', 'Dushanbe', 'TJK', 3), ('Aschgabat', 'Ashgabat', 'TKM', 3), ('Eriwan', 'Yerevan', 'ARM', 3), ('Tiflis', 'Tbilisi', 'GEO', 3),
    ('Baku', 'Baku', 'AZE', 3), ('Thimphu', 'Thimphu', 'BTN', 3), ('Kathmandu', 'Kathmandu', 'NPL', 3), ('Naypyidaw', 'Naypyidaw', 'MMR', 3),
    ('Vientiane', 'Vientiane', 'LAO', 3), ('Phnom Penh', 'Phnom Penh', 'KHM', 3), ('Dhaka', 'Dhaka', 'BGD', 3), ('Maskat', 'Muscat', 'OMN', 3),
    ('Sanaa', 'Sanaa', 'YEM', 3), ('Port Moresby', 'Port Moresby', 'PNG', 3), ('Paramaribo', 'Paramaribo', 'SUR', 3), ('Georgetown', 'Georgetown', 'GUY', 3),
    ('Tegucigalpa', 'Tegucigalpa', 'HND', 3), ('Managua', 'Managua', 'NIC', 3), ('San José', 'San José', 'CRI', 3), ('Panama-Stadt', 'Panama City', 'PAN', 3),
    ('Port-au-Prince', 'Port-au-Prince', 'HTI', 3), ('Santo Domingo', 'Santo Domingo', 'DOM', 3), ('Kingston', 'Kingston', 'JAM', 3), ('Asunción', 'Asunción', 'PRY', 3),
    ('Yaoundé', 'Yaoundé', 'CMR', 3), ('Libreville', 'Libreville', 'GAB', 3), ('Monrovia', 'Monrovia', 'LBR', 3), ('Conakry', 'Conakry', 'GIN', 3),
]
CITY = [  # wichtige Städte der Welt (keine Hauptstädte)
    ('New York', 'New York', 'USA', 1), ('Los Angeles', 'Los Angeles', 'USA', 1), ('Chicago', 'Chicago', 'USA', 1), ('Sydney', 'Sydney', 'AUS', 1),
    ('Rio de Janeiro', 'Rio de Janeiro', 'BRA', 1), ('São Paulo', 'São Paulo', 'BRA', 1), ('Istanbul', 'Istanbul', 'TUR', 1), ('Shanghai', 'Shanghai', 'CHN', 1),
    ('Mumbai', 'Mumbai', 'IND', 1), ('Kapstadt', 'Cape Town', 'ZAF', 1), ('Dubai', 'Dubai', 'ARE', 1), ('Toronto', 'Toronto', 'CAN', 1),
    ('San Francisco', 'San Francisco', 'USA', 1), ('Barcelona', 'Barcelona', 'ESP', 1), ('Mailand', 'Milan', 'ITA', 1), ('München', 'Munich', 'DEU', 1),
    ('Hamburg', 'Hamburg', 'DEU', 1), ('Venedig', 'Venice', 'ITA', 1), ('Sankt Petersburg', 'St. Petersburg', 'RUS', 1), ('Miami', 'Miami', 'USA', 1),
    ('Las Vegas', 'Las Vegas', 'USA', 1), ('Melbourne', 'Melbourne', 'AUS', 1), ('Osaka', 'Osaka', 'JPN', 1), ('Marseille', 'Marseille', 'FRA', 1),
    ('Hongkong', 'Hong Kong', 'HKG', 1, 'China'),
    ('Vancouver', 'Vancouver', 'CAN', 2), ('Montreal', 'Montréal', 'CAN', 2), ('Seattle', 'Seattle', 'USA', 2), ('Houston', 'Houston', 'USA', 2),
    ('New Orleans', 'New Orleans', 'USA', 2), ('Boston', 'Boston', 'USA', 2), ('Lagos', 'Lagos', 'NGA', 2), ('Johannesburg', 'Johannesburg', 'ZAF', 2),
    ('Casablanca', 'Casablanca', 'MAR', 2), ('Alexandria', 'Alexandria', 'EGY', 2), ('Karatschi', 'Karachi', 'PAK', 2), ('Kalkutta', 'Kolkata', 'IND', 2),
    ('Bangalore', 'Bangalore', 'IND', 2), ('Guangzhou', 'Guangzhou', 'CHN', 2), ('Ho-Chi-Minh-Stadt', 'Ho Chi Minh City', 'VNM', 2), ('Perth', 'Perth', 'AUS', 2),
    ('Auckland', 'Auckland', 'NZL', 2), ('Guadalajara', 'Guadalajara', 'MEX', 2), ('Medellín', 'Medellín', 'COL', 2), ('Salvador', 'Salvador', 'BRA', 2),
    ('Manaus', 'Manaus', 'BRA', 2), ('Mekka', 'Makkah', 'SAU', 2),
    ('Wladiwostok', 'Vladivostok', 'RUS', 3), ('Nowosibirsk', 'Novosibirsk', 'RUS', 3), ('Jekaterinburg', 'Yekaterinburg', 'RUS', 3), ('Anchorage', 'Anchorage', 'USA', 3),
    ('Honolulu', 'Honolulu', 'USA', 3), ('Denver', 'Denver', 'USA', 3), ('Atlanta', 'Atlanta', 'USA', 3), ('Calgary', 'Calgary', 'CAN', 3),
    ('Fortaleza', 'Fortaleza', 'BRA', 3), ('Córdoba', 'Córdoba', 'ARG', 3), ('Darwin', 'Darwin', 'AUS', 3), ('Chennai', 'Chennai', 'IND', 3),
    ('Lahore', 'Lahore', 'PAK', 3), ('Chengdu', 'Chengdu', 'CHN', 3), ('Wuhan', 'Wuhan', 'CHN', 3), ('Harbin', 'Harbin', 'CHN', 3),
    ('Sapporo', 'Sapporo', 'JPN', 3), ('Busan', 'Busan', 'KOR', 3), ('Surabaya', 'Surabaya', 'IDN', 3), ('Mombasa', 'Mombasa', 'KEN', 3),
    ('Durban', 'Durban', 'ZAF', 3), ('Marrakesch', 'Marrakesh', 'MAR', 3), ('Kano', 'Kano', 'NGA', 3), ('Timbuktu', 'Timbuktu', 'MLI', 3),
]
EUCAP = [  # (deutsch, NE-Name, Land, Stufe in Europa)
    ('Berlin', 'Berlin', 'DEU', 1), ('Paris', 'Paris', 'FRA', 1), ('London', 'London', 'GBR', 1), ('Rom', 'Rome', 'ITA', 1), ('Madrid', 'Madrid', 'ESP', 1),
    ('Wien', 'Vienna', 'AUT', 1), ('Bern', 'Bern', 'CHE', 1), ('Amsterdam', 'Amsterdam', 'NLD', 1), ('Brüssel', 'Brussels', 'BEL', 1),
    ('Lissabon', 'Lisbon', 'PRT', 1), ('Athen', 'Athens', 'GRC', 1), ('Warschau', 'Warsaw', 'POL', 1), ('Prag', 'Prague', 'CZE', 1),
    ('Stockholm', 'Stockholm', 'SWE', 1), ('Oslo', 'Oslo', 'NOR', 1), ('Kopenhagen', 'København', 'DNK', 1), ('Helsinki', 'Helsinki', 'FIN', 1),
    ('Dublin', 'Dublin', 'IRL', 1), ('Budapest', 'Budapest', 'HUN', 1), ('Moskau', 'Moscow', 'RUS', 1),
    ('Luxemburg', 'Luxembourg', 'LUX', 2), ('Bratislava', 'Bratislava', 'SVK', 2), ('Ljubljana', 'Ljubljana', 'SVN', 2), ('Zagreb', 'Zagreb', 'HRV', 2),
    ('Belgrad', 'Belgrade', 'SRB', 2), ('Bukarest', 'Bucharest', 'ROU', 2), ('Sofia', 'Sofia', 'BGR', 2), ('Kiew', 'Kyiv', 'UKR', 2),
    ('Minsk', 'Minsk', 'BLR', 2), ('Vilnius', 'Vilnius', 'LTU', 2), ('Riga', 'Riga', 'LVA', 2), ('Tallinn', 'Tallinn', 'EST', 2),
    ('Reykjavík', 'Reykjavík', 'ISL', 2),
    ('Chișinău', 'Chișinău', 'MDA', 3), ('Podgorica', 'Podgorica', 'MNE', 3), ('Sarajevo', 'Sarajevo', 'BIH', 3), ('Skopje', 'Skopje', 'MKD', 3),
    ('Tirana', 'Tirana', 'ALB', 3), ('Pristina', 'Pristina', 'KOS', 3), ('Nikosia', 'Nicosia', 'CYP', 3), ('San Marino', 'San Marino', 'SMR', 3),
    ('Vatikanstadt', 'Vatican City', 'VAT', 3), ('Andorra la Vella', 'Andorra', 'AND', 3), ('Vaduz', 'Vaduz', 'LIE', 3), ('Monaco', 'Monaco', 'MCO', 3),
    ('Valletta', 'Valletta', 'MLT', 3),
]
DE = [  # (deutsch, Stufe, Bundesland-Code GeoNames, GeoNames-Name falls anders)
    ('Berlin', 1, '16'), ('Hamburg', 1, '04'), ('München', 1, '02', 'Munich'), ('Köln', 1, '07'), ('Frankfurt am Main', 1, '05'),
    ('Stuttgart', 1, '01'), ('Düsseldorf', 1, '07'), ('Dresden', 1, '13'), ('Leipzig', 1, '13'), ('Hannover', 1, '06'),
    ('Nürnberg', 1, '02', 'Nuremberg'), ('Bremen', 1, '03'), ('Kiel', 1, '10'), ('Rostock', 1, '12'), ('Dortmund', 1, '07'),
    ('Essen', 1, '07'), ('Freiburg im Breisgau', 1, '01', 'Freiburg'), ('Erfurt', 1, '15'), ('Magdeburg', 1, '14'), ('Mainz', 1, '08'),
    ('Saarbrücken', 1, '09'), ('Potsdam', 1, '11'), ('Schwerin', 1, '12'), ('Wiesbaden', 1, '05'), ('Bonn', 1, '07'), ('Augsburg', 1, '02'),
    ('Münster', 2, '07'), ('Aachen', 2, '07'), ('Kassel', 2, '05'), ('Göttingen', 2, '06'), ('Würzburg', 2, '02'), ('Regensburg', 2, '02'),
    ('Heidelberg', 2, '01'), ('Karlsruhe', 2, '01'), ('Mannheim', 2, '01'), ('Ulm', 2, '01'), ('Konstanz', 2, '01'), ('Lübeck', 2, '10'),
    ('Flensburg', 2, '10'), ('Oldenburg', 2, '06'), ('Osnabrück', 2, '06'), ('Bielefeld', 2, '07'), ('Braunschweig', 2, '06'),
    ('Wolfsburg', 2, '06'), ('Halle (Saale)', 2, '14'), ('Jena', 2, '15'), ('Chemnitz', 2, '13'), ('Zwickau', 2, '13'), ('Cottbus', 2, '11'),
    ('Frankfurt (Oder)', 2, '11'), ('Trier', 2, '08'), ('Koblenz', 2, '08'), ('Passau', 2, '02'),
    ('Görlitz', 3, '13'), ('Stralsund', 3, '12'), ('Emden', 3, '06'), ('Cuxhaven', 3, '06'), ('Wilhelmshaven', 3, '06'),
    ('Westerland (Sylt)', 3, '10', 'Westerland'), ('Garmisch-Partenkirchen', 3, '02'), ('Lindau (Bodensee)', 3, '02', 'Lindau'),
    ('Berchtesgaden', 3, '02'), ('Hof', 3, '02'), ('Plauen', 3, '13'), ('Gera', 3, '15'), ('Suhl', 3, '15'), ('Eisenach', 3, '15'),
    ('Fulda', 3, '05'), ('Paderborn', 3, '07'), ('Siegen', 3, '07'), ('Kaiserslautern', 3, '08'), ('Pforzheim', 3, '01'),
    ('Ingolstadt', 3, '02'), ('Bayreuth', 3, '02'), ('Neubrandenburg', 3, '12'), ('Lüneburg', 3, '06'), ('Celle', 3, '06'), ('Goslar', 3, '06'),
]
BY = [  # Bayern (alle Bundesland-Code 02)
    ('München', 1, 'Munich'), ('Nürnberg', 1, 'Nuremberg'), ('Augsburg', 1), ('Regensburg', 1), ('Würzburg', 1), ('Ingolstadt', 1),
    ('Passau', 1), ('Bamberg', 1), ('Bayreuth', 1), ('Rosenheim', 1), ('Landshut', 1), ('Erlangen', 1), ('Fürth', 1),
    ('Kempten (Allgäu)', 1), ('Aschaffenburg', 1), ('Schweinfurt', 1), ('Hof', 1), ('Coburg', 1), ('Garmisch-Partenkirchen', 1),
    ('Berchtesgaden', 1), ('Lindau (Bodensee)', 1, 'Lindau'), ('Neu-Ulm', 1),
    ('Straubing', 2), ('Deggendorf', 2), ('Weiden in der Oberpfalz', 2, 'Weiden'), ('Ansbach', 2), ('Memmingen', 2), ('Kaufbeuren', 2),
    ('Freising', 2), ('Erding', 2), ('Dachau', 2), ('Altötting', 2), ('Kulmbach', 2), ('Neumarkt in der Oberpfalz', 2),
    ('Schwandorf', 2, 'Schwandorf in Bayern'), ('Cham', 2), ('Traunstein', 2), ('Bad Tölz', 2), ('Füssen', 2), ('Dinkelsbühl', 2),
    ('Rothenburg ob der Tauber', 2), ('Nördlingen', 2), ('Kitzingen', 2),
    ('Bad Reichenhall', 3), ('Burghausen', 3), ('Mühldorf am Inn', 3, 'Mühldorf'), ('Dingolfing', 3), ('Zwiesel', 3), ('Marktredwitz', 3),
    ('Selb', 3), ('Lichtenfels', 3), ('Kronach', 3), ('Bad Kissingen', 3), ('Miltenberg', 3), ('Ebersberg', 3),
    ('Weilheim in Oberbayern', 3, 'Weilheim'), ('Starnberg', 3), ('Mittenwald', 3), ('Oberstdorf', 3), ('Sonthofen', 3), ('Donauwörth', 3),
    ('Eichstätt', 3), ('Neuburg an der Donau', 3), ('Kelheim', 3), ('Tirschenreuth', 3), ('Freyung', 3), ('Viechtach', 3),
]

# Amberg gibt es in Bayern zweimal; die Stadt Amberg (Oberpfalz) ist die nördliche → nicht automatisch eindeutig, daher nicht im Spiel.

def uniq_ids(qs, prefix):
    for i, q in enumerate(qs):
        q['id'] = f'{prefix}{i + 1}'
    return qs

cats = {}
cats['welt-hst'] = {'n': 'Welt – Hauptstädte', 'map': 'welt', 'mode': 'pin', 'maxKm': 2500,
                    'q': uniq_ids([world_q(*c) for c in CAP], 'wh')}
cq = []
for c in CITY:
    if not c[3]: continue
    cq.append(world_q(c[0], c[1], c[2], c[3], c[4] if len(c) > 4 else None))
cats['welt-st'] = {'n': 'Welt – wichtige Städte', 'map': 'welt', 'mode': 'pin', 'maxKm': 2500, 'q': uniq_ids(cq, 'ws')}
cats['eu-hst'] = {'n': 'Europa – Hauptstädte', 'map': 'europa', 'mode': 'pin', 'maxKm': 1000,
                  'q': uniq_ids([world_q(*c) for c in EUCAP], 'eh')}
cats['de-st'] = {'n': 'Deutschland – Städte', 'map': 'de', 'mode': 'pin', 'maxKm': 300,
                 'q': uniq_ids([de_q(c[0], c[1], c[2], c[3] if len(c) > 3 else None) for c in DE], 'ds')}
cats['by-st'] = {'n': 'Bayern – Städte', 'map': 'by', 'mode': 'pin', 'maxKm': 150,
                 'q': uniq_ids([de_q(c[0], c[1], '02', c[2] if len(c) > 2 else None, False) for c in BY], 'bs')}

# Flächen: Bundesländer
BL_D = {'DE-BY': 1, 'DE-BW': 1, 'DE-NW': 1, 'DE-NI': 1, 'DE-HE': 1, 'DE-SN': 1, 'DE-SH': 1, 'DE-MV': 1, 'DE-BB': 1,
        'DE-TH': 2, 'DE-ST': 2, 'DE-RP': 2, 'DE-SL': 2, 'DE-BE': 2, 'DE-HH': 2, 'DE-HB': 2}
BL_N = {f['properties']['iso_3166_2']: f['properties']['name_de'].replace('Freie Hansestadt ', '') for f in adm1}
cats['de-bl'] = {'n': 'Deutschland – Bundesländer', 'map': 'de', 'mode': 'area', 'layer': 'adm',
                 'q': [{'id': k, 'n': BL_N[k], 'd': d} for k, d in sorted(BL_D.items(), key=lambda x: BL_N[x[0]])]}

# Flächen: Länder Europas und der Welt (deutsche Sicht: ADM0_A3_DE)
NO_Q = {'ATA', 'ATF', 'ESH', 'TWN', 'PSX', 'PSE', 'GRL', 'FLK', 'NCL', 'PRI', 'SGS', 'HMD', 'IOA', 'KAS', 'CYN', 'SOL', 'KAB', 'SAH', 'SDS', 'SPI', 'BRT', 'CLP', 'USG', 'WSB', 'ESB', 'CNM', 'BJN', 'SER', 'SCR', 'PGA'}
EU_ROOT = {'ALB', 'AND', 'AUT', 'BEL', 'BGR', 'BIH', 'BLR', 'CHE', 'CYP', 'CZE', 'DEU', 'DNK', 'ESP', 'EST', 'FIN', 'FRA', 'GBR', 'GRC', 'HRV',
           'HUN', 'IRL', 'ISL', 'ITA', 'KOS', 'LIE', 'LTU', 'LUX', 'LVA', 'MCO', 'MDA', 'MKD', 'MLT', 'MNE', 'NLD', 'NOR', 'POL', 'PRT', 'ROU',
           'RUS', 'SMR', 'SRB', 'SVK', 'SVN', 'SWE', 'UKR', 'VAT'}
EU_D1 = {'DEU', 'FRA', 'ITA', 'ESP', 'GBR', 'POL', 'AUT', 'CHE', 'NLD', 'BEL', 'DNK', 'SWE', 'NOR', 'FIN', 'PRT', 'GRC', 'CZE', 'IRL', 'UKR', 'RUS', 'HUN', 'ISL'}
EU_D2 = {'ROU', 'BGR', 'SVK', 'SVN', 'HRV', 'SRB', 'BLR', 'LTU', 'LVA', 'EST', 'LUX', 'BIH', 'ALB'}
W_D1 = {'DEU', 'FRA', 'ITA', 'ESP', 'GBR', 'USA', 'CAN', 'MEX', 'BRA', 'ARG', 'CHN', 'IND', 'JPN', 'AUS', 'RUS', 'EGY', 'ZAF', 'TUR', 'GRC',
        'POL', 'SWE', 'NOR', 'CHL', 'PER', 'SAU', 'IRN', 'IDN', 'NZL', 'KEN', 'NGA', 'MAR', 'UKR', 'PRT', 'MNG', 'KAZ', 'THA', 'KOR', 'COL', 'VEN', 'CUB'}

groups = {}
for f in c50:
    p = f['properties']
    k = p['ADM0_A3_DE']
    groups.setdefault(k, {'n': CNAME.get(k) or p['NAME_DE'], 'g': [], 'area': 0.0})
    groups[k]['g'].append(f['geometry'])
    for poly in polys(f['geometry']):
        groups[k]['area'] += ring_area(poly[0]) * math.cos(math.radians(poly[0][0][1]))
eu = [{'id': k, 'n': g['n'], 'd': 1 if k in EU_D1 else 2 if k in EU_D2 else 3} for k, g in groups.items() if k in EU_ROOT and k not in {'VAT', 'MCO', 'SMR', 'LIE', 'AND', 'MLT'}]
cats['eu-la'] = {'n': 'Europa – Länder', 'map': 'europa', 'mode': 'area', 'layer': 'land', 'q': sorted(eu, key=lambda x: x['n'])}
wl = []
for k, g in groups.items():
    if k in NO_Q or g['area'] < 1.0: continue
    d = 1 if k in W_D1 else 2 if g['area'] > 25 else 3
    wl.append({'id': k, 'n': g['n'], 'd': d})
cats['welt-la'] = {'n': 'Welt – Länder', 'map': 'welt', 'mode': 'area', 'layer': 'land', 'q': sorted(wl, key=lambda x: x['n'])}

ORTE = {'v': 1, 'src': 'Natural Earth (gemeinfrei); Städte in Deutschland: GeoNames (CC BY 4.0)', 'cats': cats}

# ---------------------------------------------------------------- Karten
def country_layer(feats, tol, dec, bb=None, min_area=0.0, group=True):
    out = {}
    for f in feats:
        p = f['properties']
        k = p['ADM0_A3_DE'] if group else p['ADM0_A3']
        r = shape(f['geometry'], tol, dec, bb, min_area)
        if not r: continue
        o = out.setdefault(k, {'id': k, 'n': CNAME.get(k) or p['NAME_DE'], 'r': []})
        o['r'] += r
    return list(out.values())

def river_layer(files, tol, dec, bb, names=None, maxrank=99):
    out = []
    for fn in files:
        for f in load(fn)['features']:
            p = f['properties']
            if (p.get('scalerank') or 0) > maxrank: continue
            if names is not None and (p.get('name') or '') not in names: continue
            for ln in lines(f['geometry']):
                if not ln or not bbox_hit(ln, bb): continue
                for part in clip_line(ln, bb):
                    r = rnd(dp(part, tol), dec)
                    if len(r) > 1: out.append({'n': (p.get('name_de') or p.get('name') or ''), 'l': r})
    return out

def lake_layer(files, tol, dec, bb, min_area):
    out = []
    for fn in files:
        for f in load(fn)['features']:
            p = f['properties']
            for poly in polys(f['geometry']):
                ring = poly[0]
                if not bbox_hit(ring, bb) or ring_area(ring) < min_area: continue
                r = rnd(dp(ring, tol), dec)
                if len(r) >= 3: out.append({'n': p.get('name_de') or p.get('name') or '', 'r': [r]})
    return out

RIV_DE = {'Rhein': 'Rhein', 'Rhine': 'Rhein', 'Rhin': 'Rhein', 'Donau': 'Donau', 'Elbe': 'Elbe', 'Main': 'Main', 'Weser': 'Weser', 'Oder': 'Oder',
          'Mosel': 'Mosel', 'Neckar': 'Neckar', 'Saale': 'Saale', 'Ems': 'Ems', 'Inn': 'Inn', 'Isar': 'Isar', 'Regnitz': 'Regnitz', 'Salzach': 'Salzach',
          'Spree': 'Spree', 'Havel': 'Havel', 'Fulda': 'Fulda', 'Werra': 'Werra', 'Lahn': 'Lahn', 'Naab': 'Naab', 'Waldnaab': 'Naab', 'Altmühl': 'Altmühl',
          'Lech': 'Lech', 'Iller': 'Iller', 'Vils': 'Vils', 'Mulde': 'Mulde', 'Zwickauer Mulde': 'Mulde', 'Ruhr': 'Ruhr', 'Lippe': 'Lippe', 'Aller': 'Aller', 'Leine': 'Leine'}

def tidy_rivers(rs):
    for r in rs:
        r['n'] = RIV_DE.get(r['n'], r['n'])
    return rs

def river_label(rs, name, near):
    """Beschriftungspunkt: der Punkt des Flusses, der am nächsten an „near“ liegt (liegt also immer auf dem Fluss)."""
    pts = [p for r in rs if r['n'] == name for p in r['l']]
    if not pts: return None
    return min(pts, key=lambda p: (p[0] - near[0]) ** 2 + (p[1] - near[1]) ** 2)

MAPS = {}
# Welt
wb = [-180, -60, 180, 84]
welt_all = country_layer(c50, 0.03, 2, min_area=0.01)
# Antarktis nur als Kulisse für den Globus: nicht antippbar, keine Frage
MAPS['welt'] = {'bb': [-170, -56, 190, 78], 'land': [c for c in welt_all if c['id'] not in ('ATA', 'ATF')], 'deco': [c for c in welt_all if c['id'] == 'ATA'],
                'lbl': [{'t': 'Atlantischer Ozean', 'll': [-38, 25], 'k': 'sea'}, {'t': 'Atlantischer Ozean', 'll': [-18, -22], 'k': 'sea'},
                        {'t': 'Pazifischer Ozean', 'll': [-140, 8], 'k': 'sea'}, {'t': 'Indischer Ozean', 'll': [78, -22], 'k': 'sea'}, {'t': 'Nordpolarmeer', 'll': [-10, 77], 'k': 'sea'},
                        {'t': 'Nordamerika', 'll': [-100, 47], 'k': 'cont'}, {'t': 'Südamerika', 'll': [-60, -12], 'k': 'cont'},
                        {'t': 'Europa', 'll': [20, 54], 'k': 'cont'}, {'t': 'Afrika', 'll': [19, 4], 'k': 'cont'},
                        {'t': 'Asien', 'll': [92, 48], 'k': 'cont'}, {'t': 'Australien', 'll': [134, -24], 'k': 'cont'},
                        {'t': 'Antarktis', 'll': [20, -80], 'k': 'cont'}]}
# Europa
eb = [-32, 30, 60, 74]
MAPS['europa'] = {'bb': [-25, 34, 45, 71.5], 'land': country_layer(c50, 0.012, 3, bb=eb),
                  'riv': tidy_rivers(river_layer(['ne_50m_rivers_lake_centerlines.geojson'], 0.03, 3, eb)),
                  'lake': lake_layer(['ne_50m_lakes.geojson'], 0.02, 3, eb, 0.05),
                  'lbl': [{'t': 'Atlantischer Ozean', 'll': [-18, 47], 'k': 'sea'}, {'t': 'Nordsee', 'll': [3.4, 56], 'k': 'sea'},
                          {'t': 'Ostsee', 'll': [19.2, 56.4], 'k': 'sea'}, {'t': 'Mittelmeer', 'll': [17.5, 35.6], 'k': 'sea'},
                          {'t': 'Schwarzes Meer', 'll': [34, 43.4], 'k': 'sea'}, {'t': 'Europäisches Nordmeer', 'll': [2, 68], 'k': 'sea'}]}
# Deutschland
db = [-6, 42.5, 27, 59]
def adm_layer(tol, dec, bb):
    return [{'id': f['properties']['iso_3166_2'], 'n': BL_N[f['properties']['iso_3166_2']], 'r': shape(f['geometry'], tol, dec, bb),
             'c': [round(f['properties']['longitude'], 3), round(f['properties']['latitude'], 3)]} for f in adm1]
de_riv = tidy_rivers(river_layer(['ne_10m_rivers_lake_centerlines.geojson', 'ne_10m_rivers_europe.geojson'], 0.006, 3, db, maxrank=10))
de_riv = [r for r in de_riv if r['n'] in set(RIV_DE.values())]
de_adm = adm_layer(0.002, 3, None)
MAPS['de'] = {'bb': [5.6, 47.2, 15.3, 55.1], 'land': [c for c in country_layer(c10, 0.003, 3, bb=db) if c['id'] != 'DEU'],
              'adm': de_adm, 'riv': de_riv,
              'lake': lake_layer(['ne_10m_lakes.geojson', 'ne_10m_lakes_europe.geojson'], 0.004, 3, db, 0.004),
              'lbl': [{'t': 'Nordsee', 'll': [6.9, 54.55], 'k': 'sea'}, {'t': 'Ostsee', 'll': [12.2, 54.75], 'k': 'sea'}]
                     + [{'t': a['n'], 'll': a['c'], 'k': 'adm'} for a in de_adm if a['id'] not in ('DE-BE', 'DE-HH', 'DE-HB')]
                     + [{'t': n, 'll': river_label(de_riv, n, nr), 'k': 'riv'} for n, nr in (('Rhein', (7.0, 50.9)), ('Donau', (11.0, 48.8)), ('Elbe', (11.8, 53.1)), ('Main', (9.9, 49.9)), ('Weser', (9.3, 52.2)), ('Oder', (14.5, 52.6))) if river_label(de_riv, n, nr)]}
# Bayern
bb_ = [3, 44.8, 20, 53]
by_riv = tidy_rivers(river_layer(['ne_10m_rivers_lake_centerlines.geojson', 'ne_10m_rivers_europe.geojson'], 0.004, 3, bb_, maxrank=11))
by_riv = [r for r in by_riv if r['n'] in set(RIV_DE.values())]
MAPS['by'] = {'bb': [8.9, 47.25, 13.9, 50.6], 'land': [c for c in country_layer(c10, 0.0015, 4, bb=bb_) if c['id'] != 'DEU'],
              'adm': [a for a in adm_layer(0.0015, 4, bb_) if a['r']], 'riv': by_riv, 'hl': 'DE-BY',
              'lake': lake_layer(['ne_10m_lakes.geojson', 'ne_10m_lakes_europe.geojson'], 0.002, 3, bb_, 0.002),
              'lbl': [{'t': 'Österreich', 'll': [13.0, 47.45], 'k': 'adm'}, {'t': 'Tschechien', 'll': [13.35, 49.95], 'k': 'adm'},
                      {'t': 'Schweiz', 'll': [9.35, 47.3], 'k': 'adm'}, {'t': 'Baden-Württemberg', 'll': [9.4, 48.7], 'k': 'adm'},
                      {'t': 'Hessen', 'll': [9.35, 50.6], 'k': 'adm'}, {'t': 'Thüringen', 'll': [11.3, 50.58], 'k': 'adm'},
                      {'t': 'Sachsen', 'll': [12.75, 50.7], 'k': 'adm'}]
                     + [{'t': n, 'll': river_label(by_riv, n, nr), 'k': 'riv'} for n, nr in (('Donau', (11.4, 48.8)), ('Main', (10.0, 49.9)), ('Inn', (12.3, 48.2)), ('Isar', (11.9, 48.45)), ('Regnitz', (10.95, 49.7)), ('Salzach', (12.85, 48.0))) if river_label(by_riv, n, nr)]}
# Kompakt speichern: jede Linie als ganze Zahlen (Grad × f), erster Punkt absolut, danach nur die Differenzen
def enc(pts, f):
    out, px, py = [], 0, 0
    for x, y in pts:
        ix, iy = round(x * f), round(y * f)
        if out and ix == px and iy == py: continue
        out += [ix - px, iy - py]; px, py = ix, iy
    return out
F = {'welt': 100, 'europa': 1000, 'de': 1000, 'by': 10000}
for k, m in MAPS.items():
    f = F[k]; m['f'] = f; m['src'] = 'Natural Earth (gemeinfrei)'
    for lay in ('land', 'deco', 'adm', 'lake'):
        for o in m.get(lay, []):
            o['r'] = [enc(r, f) for r in o['r']]
    for o in m.get('riv', []):
        o['l'] = enc(o['l'], f)

def dump(name, obj):
    p = os.path.join(OUT, name)
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
    print(f'{name}: {os.path.getsize(p) // 1024} KB')

dump('orte.json', ORTE)
for k, m in MAPS.items():
    dump(f'karte-{k}.json', m)
for k, c in cats.items():
    ds = [q['d'] for q in c['q']]
    print(f"{k}: {len(ds)} Fragen · leicht {ds.count(1)} · mittel {ds.count(2)} · schwer {ds.count(3)}")
