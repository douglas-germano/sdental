from app import create_app
from app.models import Clinic
from app.services.evolution_service import EvolutionService

app = create_app('development')

with app.app_context():
    # Get the test clinic
    clinic = Clinic.query.filter_by(email='clinica@teste.com').first()
    if not clinic:
        print("Clínica de teste não encontrada.")
        exit(1)
    
    print(f"Verificando status para clínica: {clinic.name}")
    print(f"URL API: {clinic.evolution_api_url}")
    print(f"Instância: {clinic.evolution_instance_name}")
    
    service = EvolutionService(clinic)
    status = service.get_instance_status()
    
    print("\n--- Status da Conexão ---")
    print(status)
