"""Seed the database with realistic demo data.

Run:
    python seed_data.py            # seed (keeps existing rows)
    python seed_data.py --reset    # drop all tables and reseed from scratch

Accounts after seeding (password for all: demo1234):
    admin@estate.local     - admin
    realtor@estate.local   - seller (has listings, tours, analytics)
    agency@estate.local    - seller
    buyer@estate.local     - buyer (has favorites + history so recs work)
"""
from __future__ import annotations

import argparse
import random
from datetime import date, timedelta

from models import (
    Base,
    SessionLocal,
    engine,
    User,
    RoleEnum,
    UserStatus,
    Property,
    PropertyMedia,
    PropertyType,
    DealType,
    RentTerm,
    PropertyStatus,
    MediaKind,
    Tour,
    PriceHistory,
    Review,
    Favorite,
    ViewingHistory,
    Availability,
    InfrastructurePOI,
    utcnow,
)
from modules.users.crud import hash_password

# San Francisco-ish coordinates for a believable map.
CENTER_LAT, CENTER_LNG = 37.7749, -122.4194

PANO = "https://pannellum.org/images/alma.jpg"  # public sample equirectangular image
PHOTO = "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200"

TITLES = [
    "Bright loft near the park", "Modern 2BR with city view", "Cozy studio downtown",
    "Family house with garden", "Renovated apartment", "Penthouse with terrace",
    "Commercial space on Main St", "Sunny 1BR by the bay", "Spacious townhouse",
    "Minimalist flat near metro",
]


def reset():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def ensure():
    Base.metadata.create_all(bind=engine)


def get_or_create_user(db, email, role, full_name, company=None):
    user = db.query(User).filter(User.email == email).first()
    if user:
        return user
    user = User(
        email=email,
        hashed_password=hash_password("demo1234"),
        full_name=full_name,
        role=role,
        status=UserStatus.active,
        company_name=company,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def seed():
    db = SessionLocal()
    try:
        admin = get_or_create_user(db, "admin@estate.local", RoleEnum.admin, "Platform Admin")
        realtor = get_or_create_user(db, "realtor@estate.local", RoleEnum.seller, "Rita Realtor", "Rita Realty")
        agency = get_or_create_user(db, "agency@estate.local", RoleEnum.seller, "Acme Agency", "Acme Group")
        buyer = get_or_create_user(db, "buyer@estate.local", RoleEnum.buyer, "Bob Buyer")

        sellers = [realtor, agency]

        # Infrastructure markers
        if db.query(InfrastructurePOI).count() == 0:
            pois = [
                ("metro", "Central Station"), ("metro", "Bay Line"),
                ("school", "Lincoln High"), ("school", "Sunset Elementary"),
                ("shop", "Market Plaza"), ("shop", "Corner Grocery"),
            ]
            for kind, name in pois:
                db.add(InfrastructurePOI(
                    kind=kind, name=name,
                    lat=CENTER_LAT + random.uniform(-0.03, 0.03),
                    lng=CENTER_LNG + random.uniform(-0.03, 0.03),
                ))
            db.commit()

        # Properties
        if db.query(Property).count() == 0:
            created = []
            for i in range(10):
                seller = random.choice(sellers)
                deal = random.choice([DealType.sale, DealType.rent])
                ptype = random.choice(list(PropertyType))
                if deal == DealType.sale:
                    price = random.choice([350000, 420000, 540000, 680000, 250000])
                    rent_term = None
                else:
                    price = random.choice([90, 120, 1800, 2400])  # nightly or monthly
                    rent_term = random.choice(list(RentTerm))

                prop = Property(
                    seller_id=seller.id,
                    title=TITLES[i % len(TITLES)],
                    description="A great place in a convenient location.",
                    type=ptype,
                    deal_type=deal,
                    rent_term=rent_term,
                    price=float(price),
                    area=float(random.choice([28, 45, 65, 80, 120, 200])),
                    rooms=random.choice([1, 2, 3, 4]),
                    address=f"{random.randint(1, 200)} Demo St",
                    lat=CENTER_LAT + random.uniform(-0.04, 0.04),
                    lng=CENTER_LNG + random.uniform(-0.04, 0.04),
                    house_rules="No smoking. No parties." if deal == DealType.rent else None,
                    status=PropertyStatus.active,
                    views_count=random.randint(0, 50),
                )
                db.add(prop)
                db.flush()

                for order in range(random.randint(2, 4)):
                    db.add(PropertyMedia(property_id=prop.id, url=PHOTO, type=MediaKind.photo, order=order))
                db.add(PropertyMedia(property_id=prop.id, url=PANO, type=MediaKind.pano, order=99))

                db.add(PriceHistory(property_id=prop.id, price=prop.price))
                # A small price drop in history for realism.
                db.add(PriceHistory(property_id=prop.id, price=round(prop.price * 1.05, 2)))

                # 360 tour
                db.add(Tour(property_id=prop.id, rooms=[
                    {"id": "living", "name": "Living room", "media_url": PANO,
                     "links": [{"to_room_id": "kitchen", "yaw": 120, "pitch": 0, "label": "Kitchen"}]},
                    {"id": "kitchen", "name": "Kitchen", "media_url": PANO, "links": []},
                ]))

                if deal == DealType.rent:
                    start = date.today() + timedelta(days=random.randint(1, 10))
                    db.add(Availability(property_id=prop.id, start_date=start, end_date=start + timedelta(days=20)))

                created.append(prop)
            db.commit()

            # Reviews from buyer
            for prop in created[:4]:
                db.add(Review(property_id=prop.id, user_id=buyer.id,
                              rating=random.randint(3, 5), text="Nice place, would recommend."))
            db.commit()

            # Buyer favorites + history so recommendations have signal.
            for prop in created[:3]:
                db.add(Favorite(user_id=buyer.id, property_id=prop.id))
            for prop in created[:5]:
                db.add(ViewingHistory(user_id=buyer.id, property_id=prop.id, viewed_at=utcnow()))
            db.commit()

        counts = {
            "users": db.query(User).count(),
            "properties": db.query(Property).count(),
            "tours": db.query(Tour).count(),
            "reviews": db.query(Review).count(),
            "pois": db.query(InfrastructurePOI).count(),
        }
        print("Seed complete:", counts)
        print("\nLogin with any of these (password: demo1234):")
        print("  admin@estate.local | realtor@estate.local | agency@estate.local | buyer@estate.local")
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true", help="drop all tables first")
    args = parser.parse_args()
    if args.reset:
        print("Resetting database...")
        reset()
    else:
        ensure()
    seed()
