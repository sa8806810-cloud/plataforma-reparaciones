export const LOCALIDADES_REGION = [
  'Pajacuarán',
  'Venustiano Carranza',
  'Sahuayo',
  'Jiquilpan',
  'Cojumatlán de Régules',
  'Briseñas',
  'Vista Hermosa',
  'Ixtlán',
  'La Barca',
  'Otra localidad / ranchería'
];

export const CATEGORIAS_REPARACION = {
  electricidad: {
    label: 'Electricidad e Instalaciones',
    subtipos: {
      instalacion_sin_toma: {
        label: 'Poner luz en hogar / terreno sin toma previa',
        preguntas: [
          {
            id: 'tipo_inmueble',
            label: '¿Dónde se hará la instalación?',
            tipo: 'select',
            opciones: ['Casa habitada', 'Obra negra / construcción', 'Terreno / lote', 'Local comercial']
          },
          {
            id: 'poste_cerca',
            label: '¿Hay poste o línea de luz de CFE cerca?',
            tipo: 'select',
            opciones: ['Sí, justo enfrente', 'Sí, a menos de 30 metros', 'No / está lejos', 'No estoy seguro']
          },
          {
            id: 'tiene_base',
            label: '¿Ya cuenta con tubo (mufa), base de medidor o centro de carga?',
            tipo: 'select',
            opciones: ['Nada, se ocupa instalar desde cero', 'Ya tiene algo puesto pero falta terminar', 'No sé']
          },
          {
            id: 'uso_principal',
            label: '¿Qué se va a conectar principalmente?',
            tipo: 'select',
            opciones: ['Focos y contactos básicos', 'Refrigerador / electrodomésticos', 'Bomba de agua o herramienta pesada']
          },
          {
            id: 'materiales',
            label: '¿Quién pone el material (cable, base, tubo, pastillas)?',
            tipo: 'select',
            opciones: ['Que el técnico lo cotice y lo traiga', 'Yo ya tengo el material', 'Revisar primero qué falta']
          }
        ]
      },
      falla_general: {
        label: 'Corto circuito, apagón o pastillas botadas',
        preguntas: [
          {
            id: 'alcance',
            label: '¿Se fue la luz en toda la casa o solo en una parte?',
            tipo: 'select',
            opciones: ['En toda la casa', 'Solo en cuartos / contactos', 'Solo en un aparato']
          },
          {
            id: 'olor_quemado',
            label: '¿Hubo chispazo, humo u olor a quemado?',
            tipo: 'select',
            opciones: ['Sí', 'No', 'No sé']
          }
        ]
      }
    }
  },
  plomeria: {
    label: 'Plomería y Agua',
    subtipos: {
      fuga_tuberia: {
        label: 'Fuga de agua o tubería rota',
        preguntas: [
          {
            id: 'tipo_tubo',
            label: '¿Qué tipo de tubería es (si se alcanza a ver)?',
            tipo: 'select',
            opciones: ['CPVC (crema)', 'PVC (blanco)', 'Cobre', 'Tuboplus (verde)', 'No se ve / está oculta']
          },
          {
            id: 'llave_paso',
            label: '¿Pudiste cerrar la llave de paso?',
            tipo: 'select',
            opciones: ['Sí, ya está cerrada', 'No tiene llave o no cierra', 'No sé dónde está']
          }
        ]
      }
    }
  }
};