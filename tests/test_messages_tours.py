def test_contact_realtor_and_messaging(client, buyer, seller, listing):
    r = client.post("/conversations", headers=buyer["headers"],
                    json={"property_id": listing["id"], "text": "Hi, available?"})
    assert r.status_code == 201
    cid = r.json()["id"]

    r = client.post(f"/conversations/{cid}/messages", headers=seller["headers"],
                    json={"text": "Yes!"})
    assert r.status_code == 201
    reply_id = r.json()["id"]

    r = client.post(f"/conversations/{cid}/messages", headers=buyer["headers"],
                    json={"text": "Great", "reply_to_id": reply_id})
    assert r.status_code == 201
    assert r.json()["reply_to_id"] == reply_id

    mid = r.json()["id"]
    r = client.put(f"/conversations/{cid}/messages/{mid}", headers=buyer["headers"],
                   json={"text": "Great, thanks!"})
    assert r.status_code == 200 and r.json()["is_edited"] is True

    assert client.put(f"/conversations/{cid}/messages/{mid}", headers=seller["headers"],
                      json={"text": "hack"}).status_code == 403

    r = client.delete(f"/conversations/{cid}/messages/{mid}", headers=buyer["headers"])
    assert r.status_code == 200 and r.json()["is_deleted"] is True

    from tests.conftest import _register
    _, other_token = _register(client, "buyer")
    assert client.get(f"/conversations/{cid}/messages",
                      headers={"Authorization": f"Bearer {other_token}"}).status_code == 403


def test_tour_scene_links_and_pannellum(client, buyer, seller, listing):
    pid = listing["id"]
    tour = {
        "first_room_id": "a",
        "rooms": [
            {"id": "a", "name": "Room A", "media_url": "http://x/a.jpg",
             "links": [{"to_room_id": "b", "yaw": 90, "pitch": 0, "target_yaw": -90, "label": "B"}]},
            {"id": "b", "name": "Room B", "media_url": "http://x/b.jpg", "links": []},
        ],
    }
    assert client.put(f"/tours/{pid}", headers=seller["headers"], json=tour).status_code == 200

    bad = client.put(f"/tours/{pid}", headers=seller["headers"], json={
        "rooms": [{"id": "a", "name": "A", "media_url": "x",
                   "links": [{"to_room_id": "ghost", "yaw": 0, "pitch": 0}]}],
    })
    assert bad.status_code == 422

    r = client.get(f"/tours/{pid}/pannellum", headers=buyer["headers"])
    assert r.status_code == 200
    cfg = r.json()
    assert cfg["default"]["firstScene"] == "a"
    hs = cfg["scenes"]["a"]["hotSpots"][0]
    assert hs["type"] == "scene" and hs["sceneId"] == "b"


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert "database" in r.json()
