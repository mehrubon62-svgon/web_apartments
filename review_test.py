import httpx, uuid

B = "http://localhost:8000"
c = httpx.Client(base_url=B, timeout=60)
t = uuid.uuid4().hex[:6]
h = lambda x: {"Authorization": f"Bearer {x}"}

s = c.post("/auth/register", json={"email": f"s{t}@gmail.com", "password": "secret123", "role": "seller"}).json()["access_token"]

def make(title, price, area, rooms):
    return c.post("/properties", headers=h(s), json={
        "title": title, "type": "apartment", "deal_type": "sale",
        "price": price, "area": area, "rooms": rooms,
        "lat": 37.77, "lng": -122.41, "media": [],
    }).json()["id"]

# Normal market: several 5-room ~150m2 apartments around $500k
for i in range(4):
    make(f"Normal apartment {i}", 480000 + i*15000, 150 + i*5, 5)

# The suspicious one: 5 rooms, 150m2, but only $1000
scam_id = make("Huge 5-room apartment bargain", 1000, 150, 5)
# A fair one for contrast
fair_id = make("Reasonably priced 5-room", 500000, 150, 5)

b = c.post("/auth/register", json={"email": f"b{t}@gmail.com", "password": "secret123", "role": "buyer"}).json()["access_token"]

print("=== SCAM listing ($1000 / 5 rooms / 150m2) ===")
r = c.get(f"/properties/{scam_id}/ai-review", headers=h(b)).json()
print("verdict:", r["verdict"], "| deal_score:", r["deal_score"], "| scam_risk:", r["scam_risk"], "| ai_used:", r["ai_used"])
print("summary:", r["summary"])
print("red_flags:", r["red_flags"])
print("market price_ratio_vs_median:", r["market"]["price_ratio_vs_median"])

print("\n=== FAIR listing ($500k / 5 rooms / 150m2) ===")
r2 = c.get(f"/properties/{fair_id}/ai-review", headers=h(b)).json()
print("verdict:", r2["verdict"], "| deal_score:", r2["deal_score"], "| scam_risk:", r2["scam_risk"])
print("summary:", r2["summary"])
