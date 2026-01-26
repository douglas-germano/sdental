import base64
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
    
    print(f"Buscando QR Code para: {clinic.name}")
    
    service = EvolutionService(clinic)
    qr_code_base64 = service.get_qr_code()
    
    if qr_code_base64:
        # Save to file
        with open("whatsapp_qrcode.png", "wb") as fh:
            fh.write(base64.b64decode(qr_code_base64))
        print("\n✅ QR Code salvo com sucesso em: backend/whatsapp_qrcode.png")
        print("Abra este arquivo e escaneie com seu WhatsApp.")
    else:
        print("\n❌ Não foi possível obter o QR Code.")
        print("Verifique se a instância está criada e ativa na Evolution API.")
        print("Tente também verificar se já não está conectado.")
