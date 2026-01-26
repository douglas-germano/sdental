from app import create_app
from app.models import Clinic

app = create_app('development')

with app.app_context():
    clinics = Clinic.query.all()
    print(f"Total de Clínicas encontradas: {len(clinics)}")
    
    for c in clinics:
        print("-" * 30)
        print(f"Nome: {c.name}")
        print(f"Email: {c.email}")
        print(f"ID Completo: {c.id}")
        print(f"ID Curto (8 chars): {str(c.id)[:8]}")
        print(f"Instância Configurada: {c.evolution_instance_name}")
