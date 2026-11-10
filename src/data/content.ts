export type Locale = 'en' | 'de';

export interface Content {
    title: string;
    description: string;
    lang: Locale;
    path: string;
    role: string;
    labels: {
        theme: string;
        themeSystem: string;
        themeLight: string;
        themeDark: string;
        legal: string;
        privacy: string;
        switchLang: string;
    }
}

export const content: Record<Locale, Content> = {
    en: {
        title: "Ole Meiforth - Aerospace Engineering & Software",
        description: 
            "Ole Meiforth, M.Sc. student in Aerospace Engineering at the University of Stuttgart.",
        lang: 'en',
        path: '/en/',
        role: "M.Sc. student, Aerospace Engineering · University of Stuttgart",
        labels: {
            theme: 'Colour theme',
            themeSystem: 'System',
            themeLight: 'Light',
            themeDark: 'Dark',
            switchLang: 'Deutsch',
            legal: 'Legal notice',
            privacy: 'Privacy',
        }
    },
    de: {
        title: "Ole Meiforth - Luft- und Raumfahrttechnik & Software",
        description:
            "Ole Meiforth, Masterstudent der Luft- und Raumfahrttechnik an der Universität Stuttgart.",
        lang: 'de',
        path: '/',
        role: "M.Sc.-Student, Luft- und Raumfahrttechnik · Universität Stuttgart",
        labels: {
            theme: 'Farbschema',
            themeSystem: 'System',
            themeLight: 'Hell',
            themeDark: 'Dunkel',
            switchLang: 'English',
            legal: 'Impressum',
            privacy: 'Datenschutz',
        }
    },
};