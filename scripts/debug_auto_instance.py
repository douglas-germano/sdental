from app import create_app
from app.models import Clinic
from app.services.evolution_service import EvolutionService

app = create_app('development')

with app.app_context():
    # Get the test clinic
    clinic = Clinic.query.filter_by(email='clinica@teste.com').first()
    
    print(f"Clínica: {clinic.name}")
    print(f"Instância no BD: {clinic.evolution_instance_name}")
    
    # Force the instance name from the screenshot if different (just to be sure)
    # But relies on what is in DB first.
    
    service = EvolutionService(clinic)
    
    print("\n--- Status ---")
    status = service.get_instance_status()
    print(status)
    
    print("\n--- Buscando QR Code ---")
    qr = service.get_qr_code()
    
    if qr:
        print(f"QR Code obtido!")
        print(f"Primeiros 50 chars: {qr[:50]}")
        
        has_header = qr.startswith('data:')
        print(f"Tem cabeçalho 'data:'? {has_header}")
        
        # Save to file to manual check
        import base64
        try:
            # Strip header if present for saving
            qr_data = qr.split(',')[1] if has_header else qr
            with open("debug_qr_auto.png", "wb") as fh:
                fh.write(base64.b64decode(qr_data))
            print("Salvo em debug_qr_auto.png")
        except Exception as e:
            print(f"Erro ao salvar imagem: {e}")
    else:
        print("❌ Nenhum QR Code retornado.")
