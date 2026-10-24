
from contextlib import asynccontextmanager
from pathlib import Path
import os
from bson import ObjectId
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, ConfigDict, field_validator
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ReturnDocument

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

MONGODB_URI = os.getenv("MONGODB_URI")
DB_NAME = os.getenv("MONGODB_DB", "Act_noSQL")
COLL_ESTUDIANTES = os.getenv(
    "COLL_ESTUDIANTES", "estudiantes"
)

if not MONGODB_URI:
    raise RuntimeError(
        "Falta MONGODB_URI en el archivo .env"
    )

client = None
db = None
estudiantes = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global client, db, estudiantes

    print("Archivo .env:", BASE_DIR / ".env")
    print("URI encontrada:", bool(MONGODB_URI))
    print("Base de datos:", DB_NAME)
    print("Colección:", COLL_ESTUDIANTES)

    client = AsyncIOMotorClient(
        MONGODB_URI,
        serverSelectionTimeoutMS=10000,
    )

    db = client[DB_NAME]
    estudiantes = db[COLL_ESTUDIANTES]

    try:
        await client.admin.command("ping")
        print("Conexión con MongoDB Atlas exitosa")
        yield
    except Exception as e:
        print("Error al conectar con MongoDB Atlas:")
        print(type(e).__name__, str(e))
        raise
    finally:
        client.close()


app = FastAPI(
    title="API con FastAPI y MongoDB Atlas",
    lifespan=lifespan,
)


class EstudianteIn(BaseModel):
    nombre: str
    email: str
    carrera: str
    semestre: int = Field(ge=1, le=12)


class EstudianteOut(EstudianteIn):
    id: str = Field(
        validation_alias="_id",
        serialization_alias="id",
    )

    @field_validator("id", mode="before")
    @classmethod
    def objectid_to_str(cls, value):
        if isinstance(value, ObjectId):
            return str(value)
        return value

    model_config = ConfigDict(populate_by_name=True)


@app.get("/")
async def home():
    return {"ok": True, "mensaje": "API funcionando"}


@app.get("/app", include_in_schema=False)
async def app_ui():
    html_file = BASE_DIR / "static" / "index.html"
    if not html_file.is_file():
        raise HTTPException(
            status_code=404,
            detail="No se encontró static/index.html",
        )
    return FileResponse(html_file)


@app.get("/estudiantes", response_model=list[EstudianteOut])
async def listar_estudiantes():
    return [
        EstudianteOut(**doc)
        async for doc in estudiantes.find({}).limit(50)
    ]


@app.get("/estudiantes/{id}", response_model=EstudianteOut)
async def obtener_estudiante(id: str):
    if not ObjectId.is_valid(id):
        raise HTTPException(400, "ID inválido")

    doc = await estudiantes.find_one({"_id": ObjectId(id)})
    if not doc:
        raise HTTPException(404, "Estudiante no encontrado")

    return EstudianteOut(**doc)


@app.post(
    "/estudiantes",
    response_model=EstudianteOut,
    status_code=status.HTTP_201_CREATED,
)
async def crear_estudiante(e: EstudianteIn):
    result = await estudiantes.insert_one(e.model_dump())
    nuevo = await estudiantes.find_one(
        {"_id": result.inserted_id}
    )
    return EstudianteOut(**nuevo)


@app.put("/estudiantes/{id}", response_model=EstudianteOut)
async def actualizar_estudiante(id: str, e: EstudianteIn):
    if not ObjectId.is_valid(id):
        raise HTTPException(400, "ID inválido")

    result = await estudiantes.find_one_and_update(
        {"_id": ObjectId(id)},
        {"$set": e.model_dump()},
        return_document=ReturnDocument.AFTER,
    )

    if result is None:
        raise HTTPException(404, "Estudiante no encontrado")

    return EstudianteOut(**result)


@app.delete(
    "/estudiantes/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def eliminar_estudiante(id: str):
    if not ObjectId.is_valid(id):
        raise HTTPException(400, "ID inválido")

    result = await estudiantes.delete_one(
        {"_id": ObjectId(id)}
    )

    if result.deleted_count == 0:
        raise HTTPException(404, "Estudiante no encontrado")

    return None
