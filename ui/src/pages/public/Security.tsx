import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  GitBranch,
  Database,
  Fingerprint,
  KeyRound,
  LogIn,
  MonitorSmartphone,
  ScanEye,
  ServerCrash,
  SquareArrowOutUpRight,
  ShieldCheck,
  Terminal,
  UserPlus,
} from "lucide-react";
import { REPO_LINKS, ROUTES } from "@constants/app.constants";
import { useAuthQuery } from "@hooks/queries/auth.queries";
import { KeyHierarchy } from "@components/security/KeyHierarchy";
import { ZeroKnowledgeDemo } from "@components/security/ZeroKnowledgeDemo";
import { Card, CardTitle } from "@components/ui/Card";
import { LinkButton } from "@components/ui/Button";

/**
 * Página pública que explica el modelo de seguridad.
 *
 * Existe por una razón práctica: la app le pide al usuario que suba lo más
 * sensible que tiene. Sin entender por qué el servidor no puede leerlo, la
 * decisión sensata sería no usarla. Por eso la página no se queda en la
 * promesa: enseña el diagrama, deja probar la criptografía real y termina
 * diciendo qué NO cubre.
 */

interface SectionProps {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}

const Section = ({ id, title, description, children }: SectionProps) => (
  <section id={id} className="space-y-4">
    <div className="space-y-2">
      <h2 className="text-subheading font-medium text-text-base">{title}</h2>
      {description && <p className="text-body text-text-muted">{description}</p>}
    </div>
    {children}
  </section>
);

interface SourceLinkProps {
  href: string;
  label: string;
  file: string;
}

// Enlace a un archivo concreto del repositorio. Se nombra el archivo además de
// describirlo: quien quiera auditar necesita saber DÓNDE está, no solo que
// existe.
const SourceLink = ({ href, label, file }: SourceLinkProps) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer noopener"
    className="group flex min-w-0 items-start gap-2 rounded-input border border-border-base bg-bg-base px-3 py-2 transition-colors hover:border-primary-500/50"
  >
    <SquareArrowOutUpRight
      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted group-hover:text-primary-500"
      aria-hidden="true"
    />
    <span className="min-w-0">
      <span className="block text-body text-text-base">{label}</span>
      <span className="block break-all font-mono text-caption text-text-muted">{file}</span>
    </span>
  </a>
);

interface TopicProps {
  icon: typeof KeyRound;
  title: string;
  text: string;
  tone?: "neutral" | "warning";
}

const Topic = ({ icon: Icon, title, text, tone = "neutral" }: TopicProps) => (
  <div className="flex min-w-0 flex-col gap-2 rounded-card border border-border-base bg-bg-surface p-4">
    <p className="flex items-start gap-2 font-semibold text-text-base">
      <Icon
        className={`mt-0.5 h-4 w-4 shrink-0 ${
          tone === "warning" ? "text-signal-danger" : "text-primary-500"
        }`}
        aria-hidden="true"
      />
      <span className="min-w-0">{title}</span>
    </p>
    <p className="text-body text-text-muted">{text}</p>
  </div>
);

export const Security = () => {
  const { t } = useTranslation();
  const { data } = useAuthQuery();

  return (
    <div className="mx-auto w-full min-w-0 max-w-4xl space-y-12 px-4 py-8 animate-in fade-in duration-300">
      {/* --- Portada --- */}
      <header className="space-y-5 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary-500/40 bg-primary-500/10 px-3 py-1 text-caption font-medium text-primary-600 dark:text-primary-400">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {t("security.hero.badge")}
        </span>
        <h1 className="text-heading font-semibold tracking-tight text-text-base md:text-5xl">
          {t("security.hero.title")}
        </h1>
        <p className="mx-auto max-w-2xl text-body text-text-muted md:text-lg">
          {t("security.hero.subtitle")}
        </p>

        <p className="flex justify-center">
          <a
            href={REPO_LINKS.ROOT}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-2 text-body text-text-muted underline underline-offset-4 transition-colors hover:text-text-base"
          >
            <GitBranch className="h-4 w-4" aria-hidden="true" />
            {t("security.verify.repo")}
          </a>
        </p>

        {!data?.user && (
          <div className="flex flex-col justify-center gap-3 pt-2 sm:flex-row">
            <LinkButton to={ROUTES.REGISTER} size="lg" icon={UserPlus}>
              {t("security.hero.primary")}
            </LinkButton>
            <LinkButton to={ROUTES.LOGIN} size="lg" variant="secondary" icon={LogIn}>
              {t("security.hero.secondary")}
            </LinkButton>
          </div>
        )}
      </header>

      {/* --- Jerarquía de llaves --- */}
      <Section
        id="keys"
        title={t("security.keys.title")}
        description={t("security.keys.description")}
      >
        <KeyHierarchy />
      </Section>

      {/* --- Demostración con la cripto real --- */}
      <Section
        id="demo"
        title={t("security.demo.title")}
        description={t("security.demo.description")}
      >
        <Card className="min-w-0">
          <ZeroKnowledgeDemo />
        </Card>
      </Section>

      {/* --- Escenarios --- */}
      <Section id="scenarios" title={t("security.scenarios.title")}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Topic
            icon={Database}
            title={t("security.scenarios.leakTitle")}
            text={t("security.scenarios.leakText")}
          />
          <Topic
            icon={ServerCrash}
            title={t("security.scenarios.liesTitle")}
            text={t("security.scenarios.liesText")}
          />
          <Topic
            icon={KeyRound}
            title={t("security.scenarios.masterTitle")}
            text={t("security.scenarios.masterText")}
          />
          <Topic
            icon={Fingerprint}
            title={t("security.scenarios.bothTitle")}
            text={t("security.scenarios.bothText")}
          />
        </div>
      </Section>

      {/* --- Límites: la sección que casi nadie escribe, y la que más importa --- */}
      <Section
        id="limits"
        title={t("security.limits.title")}
        description={t("security.limits.intro")}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Topic
            icon={AlertTriangle}
            tone="warning"
            title={t("security.limits.xssTitle")}
            text={t("security.limits.xssText")}
          />
          <Topic
            icon={AlertTriangle}
            tone="warning"
            title={t("security.limits.hostTitle")}
            text={t("security.limits.hostText")}
          />
          <Topic
            icon={AlertTriangle}
            tone="warning"
            title={t("security.limits.masterTitle")}
            text={t("security.limits.masterText")}
          />
          <Topic
            icon={MonitorSmartphone}
            tone="warning"
            title={t("security.limits.deviceTitle")}
            text={t("security.limits.deviceText")}
          />
        </div>
      </Section>

      {/* --- Cómo verificarlo por fuera de esta página --- */}
      <Card className="min-w-0">
        <CardTitle>
          <span className="flex items-center gap-2">
            <ScanEye className="h-5 w-5 text-primary-500" aria-hidden="true" />
            {t("security.verify.title")}
          </span>
        </CardTitle>
        <p className="flex items-start gap-2 text-body text-text-muted">
          <Terminal className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t("security.verify.text")}</span>
        </p>

        <p className="mt-6 mb-3 text-caption font-semibold uppercase tracking-wide text-text-muted">
          {t("security.verify.linksTitle")}
        </p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <SourceLink
            href={REPO_LINKS.CRYPTO}
            label={t("security.verify.cryptoLink")}
            file="ui/src/utils/crypto.ts"
          />
          <SourceLink
            href={REPO_LINKS.VAULT_FLOWS}
            label={t("security.verify.vaultLink")}
            file="ui/src/utils/vault.ts"
          />
          <SourceLink
            href={REPO_LINKS.MANIFEST}
            label={t("security.verify.manifestLink")}
            file="ui/src/utils/manifest.ts"
          />
          <SourceLink
            href={REPO_LINKS.VAULT_API}
            label={t("security.verify.apiLink")}
            file="api/src/controllers/vault.controller.ts"
          />
          <SourceLink
            href={REPO_LINKS.SCHEMA}
            label={t("security.verify.schemaLink")}
            file="api/src/database/init_tables.ts"
          />
        </div>
      </Card>
    </div>
  );
};
