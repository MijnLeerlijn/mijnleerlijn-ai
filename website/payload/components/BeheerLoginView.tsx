"use client";

import { useSearchParams } from "next/navigation";
import { EmailField, Form, FormSubmit, Link, PasswordField, useAuth, useConfig } from "@payloadcms/ui";
import { formatAdminURL, getSafeRedirect } from "payload/shared";

// Admin-rebrand Fase 1 (2026-08-12): volledig eigen, tweekoloms
// vormgegeven inlogpagina — geregistreerd als admin.components.views.login.
// Behoudt Payload's eigen authenticatie volledig ongewijzigd: dit
// hergebruikt exact dezelfde bouwstenen (Form/useAuth/EmailField/
// PasswordField/FormSubmit/getSafeRedirect/formatAdminURL) als Payload's
// eigen, vervangen LoginForm (@payloadcms/next/dist/views/Login/LoginForm)
// — dus dezelfde POST naar /api/{users}/login, dezelfde sessie-cookie,
// dezelfde deep-link-na-login-afhandeling. Geen nieuwe fetch-/cookie-
// afhandeling verzonnen (dat zou het bekende CSRF/Origin-productieprobleem
// kunnen herhalen, zie lib/auth/verify-session.ts — dat zat in het
// UITLEZEN van een bestaand sessiecookie door eigen routes, niet in het
// AANMAKEN ervan door de standaard loginflow, dus dit patroon blijft
// daarbuiten).
//
// Geen shell-wrapper nodig (vergelijk payload/components/AdminViewShell.tsx
// voor de andere custom views): de 'login'-viewKey valt samen met een
// ingebouwde Payload-route, dus Payload's eigen dispatcher wrapt dit altijd
// al in <MinimalTemplate> (kaal, geen eigen logo/kaart) — de brede
// tweekoloms-layout hieronder overschrijft alleen de breedtebeperking van
// die template, zie payload/components/admin-shell.css se
// .login.template-minimal-regel.
//
// searchParams via next/navigation se useSearchParams() i.p.v. via Payload
// se server-props: deze view is "use client" (nodig voor Form/useAuth),
// en RenderServerComponent geeft serverProps alleen door aan echte React
// Server Components — zelfde reden als de AdminViewShell.tsx-toelichting.
//
// `Users.ts` gebruikt `auth: true` (geen loginWithUsername), dus alleen een
// e-mailveld nodig — geen emailOrUsername-vertakking zoals Payload's eigen
// LoginField die (voor projecten die dat wél gebruiken) moet ondersteunen.
export function BeheerLoginView() {
  const { config } = useConfig();
  const {
    admin: { routes: adminSubRoutes, user: userSlug },
    routes: { admin: adminRoute, api: apiRoute },
  } = config;
  const { forgot: forgotRoute } = adminSubRoutes;
  const { setUser } = useAuth();
  const searchParams = useSearchParams();

  return (
    <>
      {/* Tijdelijke deploy-verificatiemarker, zie admin-shell.css#.ml-build-marker — verwijderen zodra bevestigd. */}
      <div className="ml-build-marker">ADMIN BUILD f4f0096</div>
      <div className="ml-login">
        <div className="ml-login__brand">
          <div className="ml-login__brand-logo-chip">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-kleur.svg" alt="MijnLeerlijn" className="ml-login__brand-logo" />
          </div>
          <p className="ml-login__brand-tagline">Beheer je Helpdesk, kennis en AI vanuit één plek.</p>
        </div>

        <div className="ml-login__form-side">
          <div className="ml-login__form-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/beeldmerk-kleur.png" alt="" className="ml-login__form-logo" />
            <h1 className="ml-login__form-title">Welkom terug</h1>
            <Form
              action={formatAdminURL({ apiRoute, path: `/${userSlug}/login` })}
              method="POST"
              disableSuccessStatus
              waitForAutocomplete
              onSuccess={(data) => setUser(data as Parameters<typeof setUser>[0])}
              redirect={getSafeRedirect({ fallbackTo: adminRoute, redirectTo: searchParams.get("redirect") ?? "" })}
            >
              <EmailField field={{ name: "email", label: "E-mailadres", required: true, admin: { autoComplete: "email" } }} path="email" />
              <PasswordField field={{ name: "password", label: "Wachtwoord", required: true }} path="password" />
              <Link className="ml-login__forgot" href={formatAdminURL({ adminRoute, path: forgotRoute })} prefetch={false}>
                Wachtwoord vergeten?
              </Link>
              <FormSubmit size="large">Inloggen</FormSubmit>
            </Form>
          </div>
        </div>
      </div>
    </>
  );
}
