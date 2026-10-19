from fastapi import FastAPI, HTTPException, status,Depends
from fastapi.security import HTTPAuthorizationCredentials,HTTPBearer
import json, os
from pydantic import BaseModel, Field



app = FastAPI()

DATA_FILE = "estudiantes.json"
class Estudiante(BaseModel):
    id: int
    nombre: str
    email: str
    carrera: str
    semestre: int

def cargar_datos():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return []

def guardar_datos(data):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)


@app.get("/")
def home():
    return "Hello World"


@app.get("/estudiantes/{id}")

def read_user(id: int):
    data = cargar_datos()
    for e in data:
        if isinstance(e.get("id"), int) and e["id"] == id:
            return e
    raise HTTPException(status_code=404, detail="Estudiante no encontrado por id")

@app.get("/search")
def search(q: str, limit: int = 10):
    return {"query": q, "limit": limit}

@app.post('/estudiantes')
def agregar_estudiante(e: Estudiante):
    data = cargar_datos()
    if any(x["email"] == e.email for x in data):
        raise HTTPException(status_code=400, detail="El estudiante ya existe (email duplicado)")
    if data: # si hay datos previos
        nuevo_id = max(est["id"] for est in data) + 1
    else:
        nuevo_id = 1
    nuevo_estudiante = e.model_dump()
    nuevo_estudiante["id"] = nuevo_id
    data.append(nuevo_estudiante)
    guardar_datos(data)
    return {"mensaje": "Estudiante agregado correctamente", "data": nuevo_estudiante}

@app.put("/estudiantes/{id}")
def actualizar_estudiante(id: int, e: Estudiante):
    data = cargar_datos()
    for i, est in enumerate(data):
        if isinstance(est.get("id"), int) and est["id"] == id:
            if e.email != est["email"] and any(x["email"] == e.email for x in data):
                raise HTTPException(status_code=400, detail="El email ya está registrado en otro estudiante")
            data[i] = e.model_dump()
            data[i]["id"] = id
            guardar_datos(data)
            return {"mensaje": "Estudiante actualizado correctamente", "data": data[i]}
    raise HTTPException(status_code=404, detail="Estudiante no encontrado para actualizar")

@app.delete("/estudiantes/{id}")
def eliminar_estudiante(id: int):
    data = cargar_datos()
    nueva_lista = [e for e in data if not (isinstance(e.get("id"), int) and e["id"] == id)]
    if len(nueva_lista) == len(data):
        raise HTTPException(status_code=404, detail="Estudiante no encontrado para eliminar")
    guardar_datos(nueva_lista)
    return {"mensaje": f"Estudiante con id {id} eliminado correctamente"}



@app.get("/estudiantes/email/{email}")
def obtener_estudiante(email: str):
    data = cargar_datos()
    for e in data:
        if e["email"]==email:
            return e
    raise HTTPException(status_code=404, detail="Estudiante no encontrado")
# class User(BaseModel):
#     name: str = Field(min_length=2, max_length=50,description="Nombre entre 2 y 50 caracteres")
#     age: int = Field(gt=0, lt=120, description="Edad debe serentre 1 y 119 años")
# @app.post("/users")
# def create_user(user: User):
#     return {"message": f"Usuario {user.name} creado", "data": user}


users_db = []
# @app.post("/users")
# def create_user(user: User):
#     users_db.append(user.dict())
#     return {"message": "Usuario creado", "data": user}


# @app.get("/users")
# def list_users():
#     return users_db


# @app.get("/users/index/{index}")
# def get_by_index(index:int):
#     if index < 0 or index == len(users_db):
#         raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado en el índice especificado")
#     return {"index": index, "user": users_db[index]}

@app.get("/estudiantes")
def listar_estudiantes():
    return cargar_datos()



#JWT

# Esquema de autenticación Bearer
security = HTTPBearer()

# Función de verificación (Inyección de dependencia)
def verify_token(credentials: HTTPAuthorizationCredentials =Depends(security)):
    token = credentials.credentials
    if token != "secret123": # Token simulado para el taller
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,detail="Token de autenticación inválido o ausente")
    return token

# Ruta que requiere el Token
@app.get("/protected/users")
def get_protected_users(token: str = Depends(verify_token)):
    return {"message": "Acceso concedido", "data": users_db}