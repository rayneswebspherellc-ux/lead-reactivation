import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy | Lead Reactivation",
  description: "How Lead Reactivation by RaynesWebSphere handles your chats and your data.",
};

const UPDATED = "20 October 2026";

const SECTIONS: { title: string; body: (string | string[])[] }[] = [
  {
    title: "The Short Version",
    body: [
      [
        "Your chat files are read on your own device. They are never uploaded to us or saved by us.",
        "If you ask for an AI read of one person, only the last part of that one conversation is sent to our AI provider to be read, and it is not kept by us.",
        "We never sell, share or rent your leads, and we never contact them.",
        "You can delete everything, including your account, with one button at any time.",
      ],
    ],
  },
  {
    title: "Who We Are",
    body: [
      "Lead Reactivation is a tool made by RaynesWebSphere. It helps real estate professionals find past leads worth contacting again, using the chat history they choose to add.",
    ],
  },
  {
    title: "Your Chat Files",
    body: [
      "When you add exports from Instagram, Facebook, WhatsApp, LinkedIn, TikTok or Telegram, they are opened and read inside your browser on your device. The files and the conversations in them are not sent to our servers and are not stored by us. When you close the page, start a new import, sign out or press “Delete everything”, they are gone from the app.",
      "On your device we keep only small notes you make, such as “Contacted” or “Replied” next to a lead. These stay in your browser until you delete them.",
    ],
  },
  {
    title: "The AI Read",
    body: [
      "Nothing is sent to AI unless you press a button to ask for it. When you do, we send the last part of that one person's conversation (at most 80 messages) through our server to OpenAI, our AI provider, so it can return a short summary, questions to think about and a starting message.",
      "Our server does not store or log that conversation or the answer. We ask OpenAI not to store it for its own use. OpenAI's terms for its business API say it does not use this data to train its models by default and may keep it for a limited time to watch for abuse. We will update this page if we change AI provider.",
    ],
  },
  {
    title: "Your Account",
    body: [
      "To use the app you sign in with Google or with a one-time code sent to your email. We store:",
      [
        "your email address (and, if you use Google, the account ID Google gives us, so you can sign in again)",
        "a sign-in session, stored only in a scrambled form, which ends after 30 days or when you sign out",
        "one-time email codes, stored only in a scrambled form, which expire after 10 minutes",
        "a count of how many AI reads you used each hour, so nobody can misuse the service",
      ],
      "We never store passwords, because there are none. If we later let you save your lead list across devices, it will be encrypted with a key that belongs to your account alone, and we will update this page first.",
    ],
  },
  {
    title: "Who Helps Us Run It",
    body: [
      [
        "Cloudflare hosts the app and its database.",
        "OpenAI reads a conversation when you ask for an AI read.",
        "Resend sends your sign-in code emails.",
        "Google handles “Continue with Google” sign-in if you choose it.",
      ],
      "Each gets only what it needs for that job. We do not use advertising or tracking tools in this app.",
    ],
  },
  {
    title: "Your Clients' Information",
    body: [
      "The conversations you add contain information about other people: your leads and clients. Please only add chats you are allowed to use for your work, and follow the rules that apply where you work, including on contacting people. The app never contacts anyone for you; you decide who to message and what to say.",
    ],
  },
  {
    title: "Deleting Your Data",
    body: [
      "Press “Delete everything” at the top of the app. It removes everything the app holds for you on your device and, when you are signed in, deletes your account and all of its data from our database straight away. It cannot be undone. The export files on your own computer or phone are not touched.",
    ],
  },
  {
    title: "How We Protect It",
    body: [
      [
        "Every connection is encrypted (HTTPS).",
        "Strict browser security rules: only our own code runs on the page, and the page can only talk to our own server.",
        "Each agent's data is locked to their account, and saved data is encrypted with a key unique to that account. One agent can never see another's.",
        "Sign-in codes and sessions are stored only in scrambled form, and there are limits on attempts.",
        "Only signed-in agents can use the AI read, with fair-use limits that stop misuse.",
      ],
      "No online service can promise it will never be attacked. We built this app so that as little as possible is kept, and what is kept is protected.",
    ],
  },
  {
    title: "Changes And Questions",
    body: [
      "If we change how we handle your data, we will update this page and the date below before the change takes effect. For any question about your data, contact RaynesWebSphere through rayneswebsphere.com.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-dvh w-full max-w-[1920px] mx-auto px-4 sm:px-10 lg:px-[50px] py-6 sm:py-10">
      <header className="flex items-center justify-between gap-4 mb-8">
        <Link href="/" className="flex items-center gap-3">
          <span aria-hidden="true" className="inline-flex gap-[3px]">
            <span className="w-2.5 h-2.5 rounded-full border border-rws-gold" />
            <span className="w-2.5 h-2.5 rounded-full border border-rws-gold" />
            <span className="w-2.5 h-2.5 rounded-full border border-rws-gold" />
          </span>
          <span className="text-label text-rws-gold">Lead Reactivation</span>
        </Link>
        <Link href="/" className="btn-outline">
          Back to the app
        </Link>
      </header>

      <section className="border border-rws-box-border rounded-3xl p-4 sm:p-5 lg:p-6">
        <div className="bg-rws-box-fill rounded-2xl px-6 py-5 sm:px-10 lg:px-14 mb-5">
          <h1 className="heading-section text-rws-text">Privacy Policy</h1>
          <p className="text-caption text-rws-text-secondary/60 mt-2">Last updated {UPDATED}</p>
        </div>
        <div className="px-2 sm:px-10 lg:px-14 pb-4 max-w-3xl flex flex-col gap-10">
          {SECTIONS.map((s, i) => (
            <div key={s.title} className="flex flex-col gap-4">
              {i > 0 && <div className="border-t border-rws-box-border mb-2" />}
              <h2 className="heading-h3 text-rws-text">{s.title}</h2>
              {s.body.map((b, j) =>
                Array.isArray(b) ? (
                  <ul key={j} className="flex flex-col gap-3">
                    {b.map((li) => (
                      <li key={li} className="flex gap-4 items-start">
                        <span aria-hidden="true" className="mt-2.5 w-1.5 h-1.5 rounded-full bg-rws-gold shrink-0" />
                        <span className="text-body-lg text-rws-text-secondary/80">{li}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p key={j} className="text-body-lg text-rws-text-secondary/80">
                    {b}
                  </p>
                ),
              )}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
