export const DEFAULT_SITE_CONFIG = {
  brandName: 'FixNow',
  tagline: 'Asistencia y reparaciones al instante',
  heroTitle: 'Tu hogar en buenas manos, sin complicaciones.',
  heroSubtitle: 'Encuentra ayuda confiable para reparar, instalar y mantener tu hogar. Describe lo que necesitas y recibe atención de profesionales de tu zona.',
  primaryAction: 'Solicitar reparación o instalación',
  secondaryAction: 'Acceso y registro de cuenta',
  bannerEnabled: false,
  bannerText: '',
  supportPhone: '',
  footerText: 'Servicios confiables para tu hogar.',
  allowGuestRequests: true,
  maintenanceMode: false,
  maintenanceMessage: 'Estamos realizando mejoras. Vuelve a intentarlo en unos minutos.',
  highDemandEnabled: false,
  highDemandMessage: 'Estamos atendiendo una demanda alta. Tu solicitud puede tardar un poco más.',
  primaryColor: '#317cf4',
  featuredCategories: [
    'electricidad',
    'instalacion',
    'plomeria',
    'reparaciones',
    'cerrajeria',
    'electrodomesticos'
  ],
  showHowItWorks: true,
  showTechnicians: true,
  showFaq: true
};

export function normalizeSiteConfig(configuracion) {
  const config = { ...DEFAULT_SITE_CONFIG, ...(configuracion || {}) };
  const color = /^#[0-9A-Fa-f]{6}$/.test(config.primaryColor)
    ? config.primaryColor
    : DEFAULT_SITE_CONFIG.primaryColor;

  return {
    ...config,
    primaryColor: color,
    featuredCategories: Array.isArray(config.featuredCategories)
      ? config.featuredCategories.filter((categoria) =>
        DEFAULT_SITE_CONFIG.featuredCategories.includes(categoria)
      )
      : DEFAULT_SITE_CONFIG.featuredCategories
  };
}
