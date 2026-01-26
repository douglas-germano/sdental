from app import create_app
from app.models import Clinic
from app.services.evolution_service import EvolutionService
from sqlalchemy import cast, String

app = create_app('development')

with app.app_context():
    # Fix the query using proper sqlalchemy cast
    clinic = Clinic.query.filter(cast(Clinic.id, String).like('b19ebcce%')).first()
    
    if not clinic:
        print("Clínica Douglas Germano não encontrada!")
        exit(1)
        
    print(f"Clínica: {clinic.name}")
    print(f"Instância: {clinic.evolution_instance_name}")
    
    service = EvolutionService(clinic)
    
    print("\n--- Buscando QR Code ---")
    qr = service.get_qr_code()
    
    if qr:
        print(f"QR Code obtido!")
        print(f"Começa com: {qr[:50]}")
        print(f"Tamanho: {len(qr)}")
        
        # Check for prefix
        if qr.startswith('data:image'):
            print("⚠ AVISO: A string JÁ CONTÉM o prefixo data:image")
        else:
            print("INFO: String limpa (sem prefixo).")
    else:
        print("❌ Nenhum QR Code retornado. (Retornou None/Empty)")
