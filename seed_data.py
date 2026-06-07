"""Seed the database with a large, realistic demo dataset.

Run:
    python seed_data.py            # seed (skips if data already exists)
    python seed_data.py --reset    # drop all tables and reseed from scratch

Accounts after seeding (password for ALL accounts: demo1234):
    admin@nestora.app      - admin
    rita@nestora.app       - seller (realtor, many listings)
    acme@nestora.app       - seller (agency)
    ...plus more sellers and buyers (see console output)
    buyer@nestora.app      - buyer (rich favorites + history so recs work)
"""
from __future__ import annotations

import argparse
import random
from datetime import date, timedelta, datetime, timezone

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
    Booking,
    BookingStatus,
    PaymentStatus,
    PurchaseRequest,
    Conversation,
    DirectMessage,
    Notification,
    NotificationType,
    Complaint,
    PriceTracker,
    SpatialQA,
    InfrastructurePOI,
    utcnow,
)
from modules.users.crud import hash_password

random.seed(42)

CENTER_LAT, CENTER_LNG = 37.7749, -122.4194

PHOTOS = [
    "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200",
    "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1200",
    "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200",
    "https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=1200",
    "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=1200",
    "https://images.unsplash.com/photo-1576941089067-2de3c901e126?w=1200",
    "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200",
    "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1200",
    "https://images.unsplash.com/photo-1554995207-c18c203602cb?w=1200",
    "https://images.unsplash.com/photo-1484154218962-a197022b5858?w=1200",
    "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200",
    "https://images.unsplash.com/photo-1556912172-45b7abe8b7e1?w=1200",
    "https://images.unsplash.com/photo-1567496898669-ee935f5f647a?w=1200",
    "https://images.unsplash.com/photo-1583608205776-bfd35f0d9f83?w=1200",
    "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=1200",
    "https://images.unsplash.com/photo-1598928506311-c55ded91a20c?w=1200",
]
PANOS = [
    "https://pannellum.org/images/alma.jpg",
    "https://pannellum.org/images/cerro-toco-0.jpg",
    "https://pannellum.org/images/bma-1.jpg",
]

DISTRICTS = [
    "Mission", "SoMa", "Nob Hill", "Marina", "Sunset", "Hayes Valley",
    "Castro", "Richmond", "Pacific Heights", "Dogpatch", "Noe Valley", "Russian Hill",
]
# Real on-land centres for each SF neighbourhood. Coordinates are jittered only
# slightly (~300 m) around these so listings land on the actual streets instead
# of floating in the Bay/Pacific (the old ±0.05° spread reached the water).
DISTRICT_COORDS = {
    "Mission": (37.7599, -122.4148),
    "SoMa": (37.7785, -122.4056),
    "Nob Hill": (37.7930, -122.4161),
    "Marina": (37.8005, -122.4368),
    "Sunset": (37.7600, -122.4690),
    "Hayes Valley": (37.7765, -122.4244),
    "Castro": (37.7609, -122.4350),
    "Richmond": (37.7800, -122.4700),
    "Pacific Heights": (37.7925, -122.4350),
    "Dogpatch": (37.7575, -122.3905),
    "Noe Valley": (37.7502, -122.4337),
    "Russian Hill": (37.8010, -122.4180),
}


def district_coords(district: str):
    """On-land lat/lng near a neighbourhood centre (small jitter, stays put)."""
    lat0, lng0 = DISTRICT_COORDS.get(district, (CENTER_LAT, CENTER_LNG))
    return (round(lat0 + random.uniform(-0.003, 0.003), 6),
            round(lng0 + random.uniform(-0.003, 0.003), 6))
STREETS = ["Market St", "Valencia St", "Folsom St", "Hayes St", "Union St", "Polk St",
           "Mission St", "Castro St", "Bryant St", "Lombard St", "Fillmore St"]

ADJ = ["Bright", "Modern", "Cozy", "Spacious", "Renovated", "Sunny", "Stylish",
       "Charming", "Minimalist", "Luxury", "Quiet", "Elegant"]
NOUN = {
    PropertyType.apartment: ["apartment", "flat", "loft", "studio", "condo"],
    PropertyType.house: ["house", "townhouse", "cottage", "villa", "home"],
    PropertyType.commercial: ["office", "retail space", "commercial unit", "storefront", "workspace"],
}
DESCRIPTIONS = [
    "Recently renovated with high ceilings, hardwood floors and abundant natural light. "
    "Steps from cafes, transit and a green park. Move-in ready.",
    "A quiet retreat in the heart of the city. Open-plan living, modern kitchen and a "
    "private balcony with skyline views. Excellent walk score.",
    "Bright and airy with thoughtful storage throughout. Close to schools, shops and the "
    "metro. Perfect for families or remote work.",
    "Designer finishes, smart-home ready, and energy-efficient windows. Comes with secure "
    "parking and a shared rooftop terrace.",
    "Classic character meets modern comfort. Spacious rooms, updated bathrooms, and a sunny "
    "south-facing aspect all day long.",
]
REVIEW_TEXTS = [
    "Exactly as described. The host was responsive and the location is unbeatable.",
    "Clean, quiet and comfortable. Would happily stay again.",
    "Great natural light and a lovely neighborhood. Minor wear but great value.",
    "The 360 tour was spot on — no surprises on arrival. Highly recommend.",
    "Good place overall. Transit nearby made everything easy.",
    "Spacious and well kept. The kitchen is a real highlight.",
]
MESSAGES = [
    "Hi, is this property still available?",
    "Yes, it is. Would you like to schedule a viewing?",
    "Could you tell me more about the neighborhood?",
    "Sure — it's quiet, walkable, and close to the metro.",
    "Is the price negotiable?",
    "Thanks for the quick reply!",
]
SPATIAL_QUESTIONS = [
    "What material is this wall made of?",
    "How big is this room approximately?",
    "What would it cost to replace this flooring?",
    "Is this window double-glazed?",
    "What's the ceiling height here?",
]


def reset():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def ensure():
    Base.metadata.create_all(bind=engine)


def make_user(db, email, role, full_name, company=None, status=UserStatus.active):
    user = db.query(User).filter(User.email == email).first()
    if user:
        return user
    user = User(
        email=email,
        hashed_password=hash_password("demo1234"),
        full_name=full_name,
        role=role,
        status=status,
        company_name=company,
        is_email_verified=True,
    )
    db.add(user)
    db.flush()
    return user


def build_tour(prop_id: int) -> dict:
    p1, p2, p3 = random.sample(PANOS, 3) if len(PANOS) >= 3 else (PANOS * 3)[:3]
    return {
        "first_room_id": "living",
        "rooms": [
            {
                "id": "living", "name": "Living room", "media_url": p1,
                "init_yaw": 0, "init_pitch": 0, "init_hfov": 100,
                "links": [
                    {"to_room_id": "kitchen", "yaw": 120, "pitch": -10, "target_yaw": -60, "label": "To kitchen"},
                    {"to_room_id": "bedroom", "yaw": -120, "pitch": -10, "target_yaw": 60, "label": "To bedroom"},
                ],
            },
            {
                "id": "kitchen", "name": "Kitchen", "media_url": p2,
                "init_yaw": 0, "init_pitch": 0, "init_hfov": 100,
                "links": [{"to_room_id": "living", "yaw": -60, "pitch": -10, "target_yaw": 120, "label": "Back to living room"}],
            },
            {
                "id": "bedroom", "name": "Bedroom", "media_url": p3,
                "init_yaw": 0, "init_pitch": 0, "init_hfov": 100,
                "links": [{"to_room_id": "living", "yaw": 60, "pitch": -10, "target_yaw": -120, "label": "Back to living room"}],
            },
        ],
    }


def seed():
    db = SessionLocal()
    try:
        if db.query(Property).count() > 0:
            print("Data already present. Use --reset to rebuild.")
            _print_counts(db)
            return

        admin = make_user(db, "admin@nestora.app", RoleEnum.admin, "Platform Admin")

        sellers = [
            make_user(db, "rita@nestora.app", RoleEnum.seller, "Rita Realtor", "Rita Realty"),
            make_user(db, "acme@nestora.app", RoleEnum.seller, "Acme Agency", "Acme Group"),
            make_user(db, "skyline@nestora.app", RoleEnum.seller, "Skyline Developers", "Skyline Dev"),
            make_user(db, "marco@nestora.app", RoleEnum.seller, "Marco Diaz", None),
            make_user(db, "harbor@nestora.app", RoleEnum.seller, "Harbor Homes", "Harbor Homes LLC"),
            make_user(db, "lena@nestora.app", RoleEnum.seller, "Lena Park", None),
            make_user(db, "urban@nestora.app", RoleEnum.seller, "Urban Living", "Urban Living Co"),
        ]

        buyers = [
            make_user(db, "buyer@nestora.app", RoleEnum.buyer, "Bob Buyer"),
            make_user(db, "alice@nestora.app", RoleEnum.buyer, "Alice Chen"),
            make_user(db, "sam@nestora.app", RoleEnum.buyer, "Sam Okafor"),
            make_user(db, "nina@nestora.app", RoleEnum.buyer, "Nina Volkov"),
            make_user(db, "leo@nestora.app", RoleEnum.buyer, "Leo Martins"),
            make_user(db, "maya@nestora.app", RoleEnum.buyer, "Maya Singh"),
        ]
        db.commit()

        primary_buyer = buyers[0]

        infra_defs = (
            [("school", n) for n in ["Lincoln High", "Sunset Elementary", "Mission Prep",
                                        "Bay Academy", "Hill Montessori", "Marina Middle"]]
            + [("shop", n) for n in ["Market Plaza", "Corner Grocery", "Union Mall", "Hayes Market",
                                      "Polk Deli", "Castro Center", "Marina Foods"]]
        )
        for kind, name in infra_defs:
            ilat, ilng = district_coords(random.choice(DISTRICTS))
            db.add(InfrastructurePOI(kind=kind, name=name, lat=ilat, lng=ilng))
        db.commit()

        N = 60
        created: list[Property] = []
        for i in range(N):
            seller = random.choice(sellers)
            deal = random.choices([DealType.sale, DealType.rent], weights=[6, 4])[0]
            ptype = random.choices(list(PropertyType), weights=[6, 3, 1])[0]
            rooms = random.choice([1, 1, 2, 2, 3, 3, 4, 5])
            area = float(random.choice([28, 35, 45, 55, 65, 80, 95, 120, 160, 220]))

            if deal == DealType.sale:
                price = float(random.choice([180000, 240000, 320000, 410000, 520000, 640000, 780000, 950000]))
                rent_term = None
            else:
                rent_term = random.choice(list(RentTerm))
                price = float(random.choice([85, 120, 180, 240]) if rent_term == RentTerm.short
                              else random.choice([1400, 1800, 2300, 2900, 3500]))

            district = random.choice(DISTRICTS)
            title = f"{random.choice(ADJ)} {random.choice(NOUN[ptype])} in {district}"
            created_days_ago = random.randint(0, 120)
            plat, plng = district_coords(district)

            prop = Property(
                seller_id=seller.id,
                title=title,
                description=random.choice(DESCRIPTIONS),
                type=ptype,
                deal_type=deal,
                rent_term=rent_term,
                price=price,
                area=area,
                rooms=rooms,
                address=f"{random.randint(1, 999)} {random.choice(STREETS)}, {district}",
                lat=plat,
                lng=plng,
                house_rules="No smoking. No parties. Quiet hours after 10pm." if deal == DealType.rent else None,
                status=PropertyStatus.active if random.random() > 0.08 else PropertyStatus.paused,
                views_count=random.randint(0, 400),
                created_at=datetime.now(timezone.utc) - timedelta(days=created_days_ago),
            )
            db.add(prop)
            db.flush()

            photos = random.sample(PHOTOS, random.randint(2, 5))
            for order, url in enumerate(photos):
                db.add(PropertyMedia(property_id=prop.id, url=url, type=MediaKind.photo, order=order))
            db.add(PropertyMedia(property_id=prop.id, url=random.choice(PANOS), type=MediaKind.pano, order=50))

            base = price
            for offset in (40, 20, 0):
                hp = round(base * (1 + random.uniform(-0.02, 0.08)), 2)
                db.add(PriceHistory(
                    property_id=prop.id, price=hp,
                    recorded_at=datetime.now(timezone.utc) - timedelta(days=offset),
                ))
            db.add(PriceHistory(property_id=prop.id, price=price,
                                recorded_at=datetime.now(timezone.utc)))

            if random.random() < 0.75:
                db.add(Tour(property_id=prop.id, rooms=build_tour(prop.id)))

            if deal == DealType.rent:
                start = date.today() + timedelta(days=random.randint(1, 15))
                db.add(Availability(property_id=prop.id, start_date=start,
                                    end_date=start + timedelta(days=random.randint(20, 60))))

            created.append(prop)
        db.commit()

        active = [p for p in created if p.status == PropertyStatus.active]

        for prop in random.sample(created, int(len(created) * 0.7)):
            reviewers = random.sample(buyers, random.randint(1, min(4, len(buyers))))
            for reviewer in reviewers:
                db.add(Review(
                    property_id=prop.id, user_id=reviewer.id,
                    rating=random.randint(3, 5), text=random.choice(REVIEW_TEXTS),
                    created_at=datetime.now(timezone.utc) - timedelta(days=random.randint(0, 60)),
                ))
        db.commit()

        for b in buyers:
            for prop in random.sample(active, random.randint(4, 10)):
                if not db.query(Favorite).filter(Favorite.user_id == b.id, Favorite.property_id == prop.id).first():
                    db.add(Favorite(user_id=b.id, property_id=prop.id))
            for prop in random.sample(active, random.randint(6, 15)):
                if not db.query(ViewingHistory).filter(
                    ViewingHistory.user_id == b.id, ViewingHistory.property_id == prop.id
                ).first():
                    db.add(ViewingHistory(
                        user_id=b.id, property_id=prop.id,
                        viewed_at=datetime.now(timezone.utc) - timedelta(hours=random.randint(1, 480)),
                    ))
        db.commit()

        rentals = [p for p in active if p.deal_type == DealType.rent]
        for prop in random.sample(rentals, min(len(rentals), 15)):
            renter = random.choice(buyers)
            start = date.today() + timedelta(days=random.randint(3, 40))
            nights = random.randint(2, 10)
            end = start + timedelta(days=nights)
            paid = random.random() < 0.6
            db.add(Booking(
                property_id=prop.id, renter_id=renter.id,
                start_date=start, end_date=end,
                total_price=round(prop.price * nights, 2),
                status=BookingStatus.confirmed if paid else BookingStatus.pending,
                payment_status=PaymentStatus.paid if paid else PaymentStatus.unpaid,
            ))
        db.commit()

        sales = [p for p in active if p.deal_type == DealType.sale]
        for prop in random.sample(sales, min(len(sales), 18)):
            buyer = random.choice(buyers)
            db.add(PurchaseRequest(
                property_id=prop.id, buyer_id=buyer.id,
                message="I'm interested — could we schedule a viewing this week?",
                preferred_date=date.today() + timedelta(days=random.randint(2, 14)),
            ))
        db.commit()

        for _ in range(20):
            prop = random.choice(active)
            buyer = random.choice(buyers)
            if buyer.id == prop.seller_id:
                continue
            convo = db.query(Conversation).filter(
                Conversation.buyer_id == buyer.id,
                Conversation.seller_id == prop.seller_id,
                Conversation.property_id == prop.id,
            ).first()
            if convo:
                continue
            convo = Conversation(buyer_id=buyer.id, seller_id=prop.seller_id, property_id=prop.id)
            db.add(convo)
            db.flush()
            n_msgs = random.randint(2, 6)
            for j in range(n_msgs):
                sender = buyer if j % 2 == 0 else db.query(User).get(prop.seller_id)
                db.add(DirectMessage(
                    conversation_id=convo.id, sender_id=sender.id,
                    text=MESSAGES[j % len(MESSAGES)],
                    is_read=random.random() < 0.5,
                    created_at=datetime.now(timezone.utc) - timedelta(hours=(n_msgs - j) * 3),
                ))
            convo.last_message_at = datetime.now(timezone.utc)
        db.commit()

        for _ in range(25):
            prop = random.choice(active)
            buyer = random.choice(buyers)
            done = random.random() < 0.8
            db.add(SpatialQA(
                user_id=buyer.id, property_id=prop.id,
                room_id=random.choice(["living", "kitchen", "bedroom"]),
                zone_coords={"x": round(random.uniform(0.1, 0.5), 2), "y": round(random.uniform(0.1, 0.5), 2),
                             "w": round(random.uniform(0.1, 0.3), 2), "h": round(random.uniform(0.1, 0.3), 2)},
                question=random.choice(SPATIAL_QUESTIONS),
                answer="Based on the visible texture and the property's age, this is likely painted "
                       "drywall in good condition; replacement would be modest." if done else None,
                status="done" if done else "pending",
                created_at=datetime.now(timezone.utc) - timedelta(hours=random.randint(1, 200)),
            ))
        db.commit()

        for b in buyers:
            for prop in random.sample(active, random.randint(1, 4)):
                if not db.query(PriceTracker).filter(
                    PriceTracker.user_id == b.id, PriceTracker.property_id == prop.id
                ).first():
                    db.add(PriceTracker(
                        user_id=b.id, property_id=prop.id,
                        target_price=round(prop.price * 0.9, 2), last_seen_price=prop.price,
                    ))
        db.commit()

        notif_samples = [
            (NotificationType.price_drop, {"title": "Price drop", "body": "A property on your tracker dropped 5%."}),
            (NotificationType.booking_confirmed, {"title": "Booking confirmed", "body": "Your stay is confirmed and paid."}),
            (NotificationType.new_message, {"title": "New message", "body": "Rita Realty replied to you."}),
            (NotificationType.recommendation, {"title": "New picks for you", "body": "We found 5 places you might like."}),
        ]
        for ntype, content in notif_samples:
            db.add(Notification(user_id=primary_buyer.id, type=ntype, content=content,
                                read=random.random() < 0.4))
        db.commit()

        flagged_seller = sellers[-1]
        for b in random.sample(buyers, 2):
            db.add(Complaint(
                seller_id=flagged_seller.id, buyer_id=b.id,
                property_id=random.choice(active).id,
                reason="Listing photos didn't match the actual unit.",
            ))
        db.commit()

        _print_counts(db)
        print("\nLogin (password: demo1234):")
        print("  admin@nestora.app  (admin)")
        print("  rita@nestora.app / acme@nestora.app / skyline@nestora.app ... (sellers)")
        print("  buyer@nestora.app / alice@nestora.app / sam@nestora.app ... (buyers)")
    finally:
        db.close()


def _print_counts(db):
    print("Seed complete:", {
        "users": db.query(User).count(),
        "properties": db.query(Property).count(),
        "tours": db.query(Tour).count(),
        "reviews": db.query(Review).count(),
        "bookings": db.query(Booking).count(),
        "conversations": db.query(Conversation).count(),
        "messages": db.query(DirectMessage).count(),
        "spatial_qa": db.query(SpatialQA).count(),
        "favorites": db.query(Favorite).count(),
        "pois": db.query(InfrastructurePOI).count(),
    })


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
