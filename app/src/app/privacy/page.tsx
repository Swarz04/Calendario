import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy — Calendario di Antonio Scharmuller",
  description: "Informazioni sui dati trattati dal calendario di swarz.it.",
  robots: { index: false, follow: false },
};

export default function PrivacyPage() {
  return (
    <main>
      <header className="site-header">
        <Link href="/">← Torna al calendario</Link>
        <p>Antonio Scharmuller</p>
        <span>Privacy</span>
      </header>

      <section className="hero">
        <p className="eyebrow">Informazioni</p>
        <h1>Privacy</h1>
        <p>Questa pagina descrive soltanto i trattamenti tecnicamente verificati nel calendario.</p>
      </section>

      <div className="privacy-content">
        <section>
          <h2>Titolare e contatto</h2>
          <p>
            Il titolare del trattamento è Antonio Scharmuller. Il contatto privacy generale è{" "}
            <a href="mailto:info@swarz.it">info@swarz.it</a>.
          </p>
        </section>

        <section>
          <h2>Dati della richiesta</h2>
          <p>
            Il modulo tratta nome, indirizzo email, motivo, eventuale messaggio e giorno/orario selezionato per verificare
            la disponibilità e gestire la richiesta di incontro. Il messaggio invita a non inserire dati sensibili.
          </p>
        </section>

        <section>
          <h2>Agenda pubblica</h2>
          <p>
            Il sito mostra titolo, categoria, data e orario degli eventi destinati alla pubblicazione. Descrizioni, persone
            invitate, indirizzi email, luoghi e collegamenti alle videoconferenze non vengono inclusi nella risposta pubblica.
            Richieste di colloquio ed eventi marcati come privati vengono mostrati soltanto come slot occupati.
          </p>
        </section>

        <section>
          <h2>Google Calendar</h2>
          <p>
            Quando l’integrazione OAuth è configurata, agenda, disponibilità e richieste usano un calendario Google dedicato.
            Nome, email, motivo, data e orario della richiesta vengono trasferiti a Google e conservati nell’evento privato
            in attesa. Dopo l’accettazione, Google può inviare l’invito all’indirizzo indicato; il rifiuto libera lo slot
            senza inviare automaticamente un messaggio.
          </p>
        </section>

        <section>
          <h2>Cookie e dati tecnici</h2>
          <p>
            L’area amministrativa usa un cookie tecnico di sessione, HttpOnly, SameSite Strict e Secure in produzione, con
            durata massima di otto ore. Il sito non include analytics o pubblicità. Reverse proxy e server possono registrare
            dati tecnici delle richieste per il funzionamento e la sicurezza dell’infrastruttura.
          </p>
        </section>

        <section>
          <h2>Verifiche che richiedono revisione umana</h2>
          <p>
            Basi giuridiche, tempi di conservazione, ruoli privacy, destinatari ed eventuali trattamenti di categorie
            particolari o dati di minori non vengono definiti tecnicamente da questa pagina e richiedono revisione umana.
          </p>
        </section>
      </div>

      <footer>
        <span>© {new Date().getFullYear()} Antonio Scharmuller</span>
        <span><Link href="/">Calendario</Link> · <a href="mailto:info@swarz.it">Contatto privacy</a></span>
      </footer>
    </main>
  );
}
