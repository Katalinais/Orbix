// catalogo.ts — the real catalog: three architecture models built from simple pieces.
import type { Modelo } from "./tipos";

export const CATALOGO: Modelo[] = [
  {
    id: "modelo-mvc",
    nombre: "Patrón MVC",
    resumen: "Separa los datos (Modelo), lo que se ve (Vista) y la lógica que los conecta (Controlador).",
    piezas: [
      {
        id: "vista",
        nombre: "Vista",
        descripcion: "Dibuja la información para el usuario y no contiene reglas de negocio.",
        color: 0x4cc9f0,
        posicion: [-1.2, 0.8, 0],
        tamano: [1.4, 0.9, 0.9],
      },
      {
        id: "controlador",
        nombre: "Controlador",
        descripcion: "Recibe las acciones del usuario y decide qué debe hacer el Modelo y qué debe mostrar la Vista.",
        color: 0xffcc29,
        posicion: [1.2, 0.8, 0],
        tamano: [1.4, 0.9, 0.9],
      },
      {
        id: "modelo",
        nombre: "Modelo",
        descripcion: "Guarda los datos y las reglas del dominio. No sabe nada de la pantalla.",
        color: 0x80ed99,
        posicion: [0, -0.8, 0],
        tamano: [1.8, 0.9, 0.9],
      },
    ],
  },
  {
    id: "modelo-capas",
    nombre: "Arquitectura en capas",
    resumen: "Apila responsabilidades: cada capa solo habla con la que tiene justo debajo.",
    piezas: [
      {
        id: "presentacion",
        nombre: "Capa de presentación",
        descripcion: "Interfaz de usuario: pantallas, formularios y validaciones de entrada.",
        color: 0x4cc9f0,
        posicion: [0, 1.2, 0],
        tamano: [2.6, 0.8, 1],
      },
      {
        id: "logica",
        nombre: "Capa de lógica",
        descripcion: "Reglas de negocio y casos de uso. Es la capa que más cambia con el negocio.",
        color: 0xffcc29,
        posicion: [0, 0, 0],
        tamano: [2.6, 0.8, 1],
      },
      {
        id: "datos",
        nombre: "Capa de datos",
        descripcion: "Acceso a bases de datos y servicios externos. Oculta de dónde vienen los datos.",
        color: 0x80ed99,
        posicion: [0, -1.2, 0],
        tamano: [2.6, 0.8, 1],
      },
    ],
  },
  {
    id: "modelo-microservicios",
    nombre: "Microservicios",
    resumen: "Divide la aplicación en servicios pequeños que se despliegan y escalan por separado.",
    piezas: [
      {
        id: "puerta",
        nombre: "Puerta de enlace",
        descripcion: "Punto de entrada único: enruta cada petición al servicio correcto.",
        color: 0x4cc9f0,
        posicion: [0, 1.3, 0],
        tamano: [3.6, 0.6, 0.9],
      },
      {
        id: "servicio-a",
        nombre: "Servicio A",
        descripcion: "Un servicio con su propia lógica y sus propios datos.",
        color: 0xffcc29,
        posicion: [-1.3, 0.1, 0],
        tamano: [1, 1.1, 0.9],
      },
      {
        id: "servicio-b",
        nombre: "Servicio B",
        descripcion: "Se despliega y escala sin tocar a los demás servicios.",
        color: 0xff9f1c,
        posicion: [0, 0.1, 0],
        tamano: [1, 1.1, 0.9],
      },
      {
        id: "servicio-c",
        nombre: "Servicio C",
        descripcion: "Puede estar escrito en otra tecnología distinta a la de sus vecinos.",
        color: 0xf72585,
        posicion: [1.3, 0.1, 0],
        tamano: [1, 1.1, 0.9],
      },
      {
        id: "mensajeria",
        nombre: "Bus de mensajes",
        descripcion: "Canal por el que los servicios se avisan eventos sin conocerse entre sí.",
        color: 0x80ed99,
        posicion: [0, -1.2, 0],
        tamano: [3.6, 0.5, 0.9],
      },
    ],
  },
];
