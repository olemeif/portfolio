import { site } from './site';

export type Locale = 'en' | 'de';

export interface Entry {
  period: string;
  title: string;
  org: string;
  points: string[];
}

export interface Project {
  name: string;
  meta: string;
  text: string;
  link?: { href: string; label: string };
}

export interface Content {
  lang: Locale;
  path: string;
  title: string;
  description: string;
  role: string;
  intro: string;
  kicker: string;
  lead: string;
  leadMore: string;
  labels: {
    contact: string;
    email: string;
    profiles: string;
    source: string;
    theme: string;
    themeSystem: string;
    themeLight: string;
    themeDark: string;
    switchLang: string;
    /** Accessible label of the language switch, written in the language it leads to. */
    switchLangTitle: string;
    legal: string;
    privacy: string;
  };
  /** "Leaving the site" dialog shown before following an external link. */
  leave: {
    title: string;
    text: string;
    stay: string;
    go: string;
  };
}

const kalmanUrl = 'https://github.com/olemeif/kalman-tracking';

export const content: Record<Locale, Content> = {
  en: {
    lang: 'en',
    path: '/en/',
    title: `${site.name} — Aerospace Engineering & Software`,
    description:
      'Ole Meiforth, M.Sc. student in Aerospace Engineering at the University of Stuttgart with a focus on Information Technology and Flight Guidance. Find him on GitHub and LinkedIn.',
    role: 'M.Sc. student, Aerospace Engineering @ University of Stuttgart',
    intro:
      'I build software that turns test and flight data into something engineers can work with: report generators for ADAS certification at Mercedes-Benz, and analysis tools for multi-UAV flight tests. My focus in the master’s programme is information technology and flight guidance, particularly estimation methods and sensor fusion.',
    kicker: 'M.SC. STUDENT · AEROSPACE ENGINEERING',
    lead: 'I build Python tools for test and flight data, from ADAS validation to UAV telemetry. I am currently learning more about information technology and flight guidance, particularly estimation methods and sensor fusion.',
    leadMore: 'You can find me on GitHub and LinkedIn, or write me an email.',
    labels: {
      contact: 'Contact',
      email: 'Email',
      profiles: 'Profiles and contact',
      source: 'Source',
      theme: 'Toggle colour theme',
      themeSystem: 'System',
      themeLight: 'Light',
      themeDark: 'Dark',
      switchLang: 'Deutsch',
      switchLangTitle: 'Auf Deutsch anzeigen',
      legal: 'Legal notice',
      privacy: 'Privacy',
    },
    leave: {
      title: 'LEAVING OLEMEIF.DE',
      text: 'You are now leaving this site and will open',
      stay: 'Stay',
      go: 'Continue',
    },
  },

  de: {
    lang: 'de',
    path: '/',
    title: `${site.name} — Luft- und Raumfahrttechnik & Software`,
    description:
      'Ole Meiforth, Masterstudent der Luft- und Raumfahrttechnik an der Universität Stuttgart mit Fokus auf Informationstechnik und Flugführung. Zu finden auf GitHub und LinkedIn.',
    role: 'M.Sc.-Student, Luft- und Raumfahrttechnik @ Universität Stuttgart',
    intro:
      'Ich entwickle Software, die Versuchs- und Flugdaten für Ingenieure nutzbar macht: Berichtsgeneratoren für die ADAS-Zertifizierung bei Mercedes-Benz und Auswertewerkzeuge für Flugversuche mit mehreren UAVs. Im Master liegt mein Schwerpunkt auf Informationstechnik und Flugführung, insbesondere Schätzverfahren und Sensorfusion.',
    kicker: 'M.SC.-STUDENT · LUFT- UND RAUMFAHRTTECHNIK',
    lead: 'Ich entwickle Python-Tools für Versuchs- und Flugdaten, von der ADAS-Validierung bis zur UAV-Telemetrie. Ich lerne gerade mehr über Informationstechnik und Flugführung, insbesondere Schätzverfahren und Sensorfusion.',
    leadMore: 'Sie finden mich auf GitHub und LinkedIn oder erreichen mich per E-Mail.',
    labels: {
      contact: 'Kontakt',
      email: 'E-Mail',
      profiles: 'Profile und Kontakt',
      source: 'Quellcode',
      theme: 'Farbschema wechseln',
      themeSystem: 'System',
      themeLight: 'Hell',
      themeDark: 'Dunkel',
      switchLang: 'English',
      switchLangTitle: 'View in English',
      legal: 'Impressum',
      privacy: 'Datenschutz',
    },
    leave: {
      title: 'SIE VERLASSEN OLEMEIF.DE',
      text: 'Sie verlassen jetzt diese Seite und öffnen',
      stay: 'Bleiben',
      go: 'Weiter',
    },
  },
};
