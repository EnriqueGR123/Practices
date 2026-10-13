from fastapi import FastAPI, HTTPException, status,Depends
from fastapi.security import HTTPAuthorizationCredentials,HTTPBearer

from pydantic import BaseModel, Field

app = FastAPI()

@app.get("/")
def home():
    return "Hello World"


@app.get("/users/{user_id}")
def read_user(user_id: int):
    return {"user_id": user_id}


@app.get("/search")
def search(q: str, limit: int = 10):
    return {"query": q, "limit": limit}



class User(BaseModel):
    name: str = Field(min_length=2, max_length=50,description="Nombre entre 2 y 50 caracteres")
    age: int = Field(gt=0, lt=120, description="Edad debe serentre 1 y 119 años")

# @app.post("/users")
# def create_user(user: User):
#     return {"message": f"Usuario {user.name} creado", "data": user}


users_db = []
@app.post("/users")
def create_user(user: User):
    users_db.append(user.dict())
    return {"message": "Usuario creado", "data": user}


@app.get("/users")
def list_users():
    return users_db


@app.get("/users/index/{index}")
def get_by_index(index:int):
    if index < 0 or index == len(users_db):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado en el índice especificado")
    return {"index": index, "user": users_db[index]}





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