def test_favorite_add_remove(client, buyer, listing):
    pid = listing["id"]
    assert client.post(f"/favorites/{pid}", headers=buyer["headers"]).status_code == 201
    r = client.get("/favorites", headers=buyer["headers"])
    assert any(p["id"] == pid for p in r.json()["items"])
    assert client.delete(f"/favorites/{pid}", headers=buyer["headers"]).status_code == 200
    r = client.get("/favorites", headers=buyer["headers"])
    assert not any(p["id"] == pid for p in r.json()["items"])


def test_booking_requires_rental(client, buyer, listing):
    # listing is a SALE property -> booking should be rejected
    r = client.post("/bookings", headers=buyer["headers"],
                    json={"property_id": listing["id"], "start_date": "2026-07-01", "end_date": "2026-07-03"})
    assert r.status_code == 400


def test_booking_and_payment(client, buyer, seller):
    rent = client.post("/properties", headers=seller["headers"], json={
        "title": "Rental", "type": "apartment", "deal_type": "rent", "rent_term": "short",
        "price": 100, "area": 30, "media": [],
    }).json()
    r = client.post("/bookings", headers=buyer["headers"],
                    json={"property_id": rent["id"], "start_date": "2026-07-01", "end_date": "2026-07-04"})
    assert r.status_code == 201
    co = r.json()
    assert co["checkout_url"] and co["payment_token"]

    bid = co["booking_id"]
    # Programmatic test payment
    r = client.post(f"/bookings/{bid}/pay-test", headers=buyer["headers"])
    assert r.status_code == 200
    assert r.json()["status"] == "confirmed"
    assert r.json()["payment_status"] == "paid"

    # Overlapping dates now conflict
    r = client.post("/bookings", headers=buyer["headers"],
                    json={"property_id": rent["id"], "start_date": "2026-07-02", "end_date": "2026-07-05"})
    assert r.status_code == 409
