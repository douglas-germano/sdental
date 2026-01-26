from app import create_app
from app.models import Clinic
from app.services.evolution_service import EvolutionService

app = create_app('development')

with app.app_context():
    # Get the test clinic
    clinic = Clinic.query.filter_by(email='clinica@teste.com').first()
    
    print(f"Clínica: {clinic.name}")
    print(f"Instância: {clinic.evolution_instance_name}")
    
    service = EvolutionService(clinic)
    
    print("\n--- Buscando QR Code ---")
    qr = service.get_qr_code()
    
    if qr:
        print(f"QR Code obtido (primeiros 50 chars): {qr[:50]}...")
        print(f"Tamanho total: {len(qr)}")
        
        # Check if it starts with data:image
        if qr.startswith('data:'):
            print("AVISO: O retorno já contém o prefixo data:image/...")
        else:
            print("OK: O retorno parece ser apenas o Base64 puro (sem prefixo).")
    else:
        print("❌ Nenhum QR Code retornado (pode estar conectado ou erro).")
        
    print("\n--- Verificando Status ---")
    status = service.get_instance_status()
    print(status)
