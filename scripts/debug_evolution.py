import requests
from app import create_app
from app.models import Clinic

app = create_app('development')

with app.app_context():
    clinic = Clinic.query.filter_by(email='clinica@teste.com').first()
    
    url = clinic.evolution_api_url
    api_key = clinic.evolution_api_key
    instance = clinic.evolution_instance_name
    
    headers = {
        'apikey': api_key,
        'Content-Type': 'application/json'
    }
    
    print(f"URL: {url}")
    print(f"Instance: {instance}")
    
    # 1. Tentar criar a instância (caso não exista)
    print("\n1. Tentando criar instância...")
    create_url = f"{url}/instance/create"
    create_payload = {
        "instanceName": instance,
        "token": api_key, # Sometimes needed as a token for the instance
        "qrcode": True
    }
    
    try:
        resp = requests.post(create_url, json=create_payload, headers=headers)
        print(f"Status: {resp.status_code}")
        print(f"Response: {resp.text}")
    except Exception as e:
        print(f"Erro ao criar: {e}")

    # 2. Tentar conectar / pegar QR Code
    print("\n2. Tentando buscar QR Code...")
    connect_url = f"{url}/instance/connect/{instance}"
    try:
        resp = requests.get(connect_url, headers=headers)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            if 'base64' in data:
                import base64
                with open("qrcode_debug.png", "wb") as fh:
                    fh.write(base64.b64decode(data['base64']))
                print("✅ QR Code salvo em backend/qrcode_debug.png")
            else:
                print(f"Sem base64 na resposta: {data}")
        else:
            print(f"Erro na resposta: {resp.text}")
            
    except Exception as e:
        print(f"Erro ao conectar: {e}")
