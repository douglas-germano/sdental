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
    
    print("\n3. Verificando connectionState...")
    state_url = f"{url}/instance/connectionState/{instance}"
    try:
        resp = requests.get(state_url, headers=headers)
        print(f"Status: {resp.status_code}")
        print(f"Response: {resp.text}")
    except Exception as e:
        print(f"Erro ao verificar state: {e}")
