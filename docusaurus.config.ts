import { themes as prismThemes } from "prismjs/themes";

const config = {
  title: "traceprojector",
  tagline: "Bounded, Commuting, Discrete-trace Preserving Projections",
  favicon: "img/favicon.svg",
  url: "https://sachncs.github.io",
  baseUrl: "/traceprojector/",
  organizationName: "sachncs",
  projectName: "traceprojector",
  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",
  i18n: { defaultLocale: "en", locales: ["en"] },
  presets: [
    [
      "classic",
      {
        docs: { sidebarPath: "./sidebars.js", routeBasePath: "/" },
        blog: false,
        theme: { customCss: "./src/css/custom.css" },
      },
    ],
  ],
  themeConfig: {
    image: "img/social-preview.png",
    navbar: {
      title: "traceprojector",
      items: [
        {
          href: "https://github.com/sachncs/traceprojector",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    prism: { theme: prismThemes.github, darkTheme: prismThemes.dracula },
  },
};

export default config;
