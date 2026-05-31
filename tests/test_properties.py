def test_create_listing_requires_seller(client, buyer):
    r = client.post(
        "/properties",
        headers=buyer["headers"],
        json={"title": "X", "type": "apartment", "deal_type": "sale",
              "price": 100000, "area": 40, "media": []},
    )
    assert r.status_code == 403  # buyers can't create listings


def test_listing_appears_in_catalog(client, buyer, listing):
    r = client.get("/properties", headers=buyer["headers"])
    assert r.status_code == 200
    ids = [p["id"] for p in r.json()["items"]]
    assert listing["id"] in ids


def test_filters_price(client, buyer, listing):
    r = client.get("/properties", headers=buyer["headers"], params={"max_price": 100})
    assert r.status_code == 200
    ids = [p["id"] for p in r.json()["items"]]
    assert listing["id"] not in ids  # 250k listing excluded by max_price=100


def test_map_marker_present(client, buyer, listing):
    r = client.get("/properties/map", headers=buyer["headers"])
    assert r.status_code == 200
    assert any(m["id"] == listing["id"] for m in r.json())


def test_mortgage_calc(client, buyer, listing):
    r = client.post(
        f"/properties/{listing['id']}/mortgage",
        headers=buyer["headers"],
        json={"down_payment": 50000, "annual_rate": 7.5, "years": 30},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["monthly_payment"] > 0
    assert body["total_paid"] > body["principal"]


def test_compare(client, buyer, seller):
    ids = []
    for price, area in [(200000, 50), (300000, 80)]:
        r = client.post("/properties", headers=seller["headers"], json={
            "title": "Compare unit", "type": "apartment", "deal_type": "sale",
            "price": price, "area": area, "media": [],
        })
        ids.append(r.json()["id"])
    r = client.get("/properties/compare", headers=buyer["headers"],
                   params={"ids": ",".join(map(str, ids))})
    assert r.status_code == 200
    body = r.json()
    assert body["cheapest_id"] == ids[0]
    assert len(body["items"]) == 2


def test_search_text(client, buyer, seller):
    client.post("/properties", headers=seller["headers"], json={
        "title": "Penthouse with skyline view", "type": "apartment", "deal_type": "sale",
        "price": 900000, "area": 150, "media": [],
    })
    r = client.get("/properties/search", headers=buyer["headers"], params={"q": "skyline"})
    assert r.status_code == 200
    assert r.json()["total"] >= 1


def test_view_tracks_history(client, buyer, listing):
    client.get(f"/properties/{listing['id']}", headers=buyer["headers"])
    r = client.get("/history", headers=buyer["headers"])
    assert r.status_code == 200
    assert any(i["property"]["id"] == listing["id"] for i in r.json()["items"])
