from abc import ABC, abstractmethod
import random


# Clase abstracta
class Pokemon(ABC):

    def __init__(self, nombre, tipo, nivel, color, velocidad):
        self.__nombre = nombre
        self.__tipo = tipo
        self.__nivel = nivel
        self.__vida = 100
        self.__color = color
        self.__velocidad = velocidad

    # Método abstracto
    @abstractmethod
    def evolucionar(self):
        pass

    # Métodos comunes para todos los Pokémon
    def mostrar_info(self):
        print("Nombre:", self.__nombre)
        print("Tipo:", self.__tipo)
        print("Nivel:", self.__nivel)
        print("Color:", self.__color)
        print("Velocidad:", self.__velocidad)
        print("Vida:", self.__vida)

    def atacar(self, pokemon):
        dano = random.randint(1, 20)

        print(self.__nombre + " lanza un ataque tipo " +
              self.__tipo + " a " + pokemon.__nombre)

        pokemon.__vida -= dano

        if pokemon.__vida <= 0:
            pokemon.__vida = 0
            print(pokemon.__nombre + " ya no tiene vida")
        else:
            print("Vida restante de " +
                  pokemon.__nombre + ": " + str(pokemon.__vida))

    def velocidad(self):
        return self.__velocidad

    def color(self):
        return self.__color

    def batallaPokemon(self, pokemon):
        while self.__vida > 0 and pokemon.__vida > 0:
            self.atacar(pokemon)

            if pokemon.__vida > 0:
                pokemon.atacar(self)


# Clase hija Pikachu
class Pikachu(Pokemon):

    def evolucionar(self):
        print("Pikachu ha evolucionado a Raichu")


# Clase hija Charizard
class Charizard(Pokemon):

    def evolucionar(self):
        print("Charizard no puede evolucionar en este ejercicio")


# Clase hija Sceptile
class Sceptile(Pokemon):

    def evolucionar(self):
        print("Sceptile no puede evolucionar en este ejercicio")


# Crear objetos
pikachu = Pikachu("Pikachu", "Eléctrico", 5, "Amarillo", 90)
charizard = Charizard("Charizard", "Fuego Volador", 34, "Rojo", 200)
sceptile = Sceptile("Sceptile", "Planta", 50, "Verde", 140)


# Mostrar información
pikachu.mostrar_info()
print()

charizard.mostrar_info()
print()

sceptile.mostrar_info()
print()


# Evolución
pikachu.evolucionar()
charizard.evolucionar()
sceptile.evolucionar()