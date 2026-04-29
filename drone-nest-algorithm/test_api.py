import requests
import json

url = "http://localhost:5000/api/v1/matching"
payload = {
    "drones": [
        {
            "drone_id": "D001",
            "battery": 0.25,
            "status": "idle",
            "position": {"lng": 116.3, "lat": 39.9},
            "priority": 3
        }
    ],
    "nests": [
        {
            "nest_id": "N001",
            "status": "available",
            "position": {"lng": 116.4, "lat": 39.8},
            "capacity": 4,
            "current_charging": 1,
            "charge_rate": 0.004
        }
    ]
}

response = requests.post(url, json=payload)
print(f"Status: {response.status_code}")
print(f"Response: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")