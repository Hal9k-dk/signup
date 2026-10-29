import { submitSignup } from "./signup-client.js";

// Local survey definition, not a framework shared with other experiences.
// Only real signup questions have a name, so FormData excludes the nonsense.
const questions = [
  {
    name: "firstName",
    title: "Hvad er dit fornavn (eller dine fornavne)?",
    hint: "Vi starter stærkt med noget, vi faktisk har brug for.",
    autocomplete: "given-name",
  },
  {
    name: "lastName",
    title: "Og dit efternavn (eller dine efternavne)?",
    hint: "Ja, det kunne have stået på samme side. Men så var vi jo allerede videre.",
    autocomplete: "family-name",
  },
  {
    id: "currentTime",
    title: "Hvad er klokken lige nu?",
    hint: "Et cirka-svar er fint. Vi har et ur, men det er princippet.",
    type: "time",
  },
  {
    name: "email",
    title: "Hvad er din emailadresse?",
    hint: "En adresse, vi kan kontakte dig på om din indmeldelse.",
    type: "email",
    autocomplete: "email",
  },
  {
    name: "street",
    title: "Hvad er dit vejnavn og husnummer?",
    hint: "Vejnavn og nr. — dette tæller nådigt nok som ét spørgsmål.",
    autocomplete: "street-address",
  },
  {
    id: "potato",
    title: "Vælg din foretrukne nødkartoffel.",
    hint: "En kritisk del af enhver beredskabsplan. Angiveligt.",
    options: [
      ["baked", "Bagt — klar til alt"],
      ["boiled", "Kogt — en rolig problemløser"],
      ["raw", "Rå — jeg kompilerer selv"],
    ],
  },
  {
    name: "postalCode",
    title: "Hvad er dit postnummer?",
    hint: "Fire cifre. Endnu en hel side sparet på absolut ingenting.",
    autocomplete: "postal-code",
    pattern: "[0-9]{4}",
    inputmode: "numeric",
    maxlength: 4,
  },
  {
    name: "city",
    title: "Hvilken by bor du i?",
    hint: "Vi kunne have gættet ud fra postnummeret. Vi valgte dette i stedet.",
    autocomplete: "address-level2",
  },
  {
    id: "duck",
    title: "Hvor meget stoler du på en and med en skruetrækker?",
    hint: "Svar efter mavefornemmelsen. Ikke efter andens CV.",
    options: [
      ["none", "Slet ikke. Den mangler sikkerhedsbriller."],
      ["some", "Kun med supervision"],
      ["all", "Den er allerede min tech lead"],
    ],
  },
  {
    name: "birthDate",
    title: "Hvad er din fødselsdato?",
    hint: "I formatet dd-mm-yyyy. Selv denne formular har enkelte standarder.",
    autocomplete: "bday",
    pattern: "[0-9]{2}-[0-9]{2}-[0-9]{4}",
    inputmode: "numeric",
    maxlength: 10,
    placeholder: "dd-mm-yyyy",
  },
  {
    name: "phone",
    title: "Hvad er dit telefonnummer?",
    hint: "Telefon nr. Ikke din routers IP-adresse.",
    type: "tel",
    autocomplete: "tel",
  },
  {
    id: "noise",
    title: "Hvordan lyder din indre printer?",
    hint: "Mindst ét tegn. Vi accepterer også stilhed, hvis du skriver ordet ‘stilhed’.",
    placeholder: "Brrr-klonk-bip",
  },
  {
    name: "membership",
    title: "Hvilket medlemsskab vil du have?",
    hint: "Et relevant spørgsmål! Nyd øjeblikket.",
    options: [
      ["ordinary", "Almindeligt medlem"],
      ["student", "Studiemedlem"],
    ],
  },
  {
    id: "confirmation",
    title: "Bekræft, at dette spørgsmål var unødvendigt.",
    hint: "Vi har brug for din bekræftelse til vores interne unødvendighedsrapport.",
    options: [
      ["yes", "Ja, helt unødvendigt"],
      ["very", "Ekstremt unødvendigt"],
    ],
  },
  {
    name: "message",
    title: "Har du en besked til os?",
    hint: "Valgfrit, endelig. Vil du have PROSA-rabat? Skriv dit medlemsnummer her.",
    type: "textarea",
    required: false,
    maxlength: 1000,
  },
];

const form = document.querySelector("#signup-form");
const container = document.querySelector("#questions");
const status = document.querySelector("#form-status");
const back = document.querySelector("#back");
const next = document.querySelector("#next");
const progress = document.querySelector("#progress");
const count = document.querySelector("#step-count");
let current = 0;
let sending = false;

const steps = questions.map((question, index) => {
  const section = document.createElement("section");
  section.className = "question";
  section.hidden = true;
  const title = document.createElement("h2");
  title.id = `title-${index}`;
  title.textContent = question.title;
  title.tabIndex = -1;
  const hint = document.createElement("p");
  hint.id = `hint-${index}`;
  hint.className = "hint";
  hint.textContent = question.hint;
  const label = document.createElement("label");
  label.htmlFor = `answer-${index}`;
  label.className = "answer-label";
  label.textContent =
    question.required === false
      ? "Dit svar (valgfrit)"
      : "Dit svar (obligatorisk)";
  const input = document.createElement(
    question.options
      ? "select"
      : question.type === "textarea"
        ? "textarea"
        : "input",
  );
  input.id = label.htmlFor;
  if (question.name) input.name = question.name;
  else input.dataset.survey = question.id;
  if (question.options) {
    input.append(new Option("Vælg et svar…", ""));
    for (const [value, text] of question.options)
      input.append(new Option(text, value));
  } else if (question.type !== "textarea") input.type = question.type || "text";
  input.required = question.required !== false;
  if (!question.options) input.maxLength = question.maxlength || 256;
  for (const attribute of [
    "autocomplete",
    "pattern",
    "inputmode",
    "placeholder",
  ]) {
    if (question[attribute]) input.setAttribute(attribute, question[attribute]);
  }
  input.setAttribute("aria-describedby", hint.id);
  section.setAttribute("aria-labelledby", title.id);
  section.append(title, hint, label, input);
  container.append(section);
  return { section, input, title };
});

function show(index, focus = true) {
  current = index;
  steps.forEach((step, i) => {
    step.section.hidden = i !== index;
  });
  status.textContent = "";
  count.textContent = `Spørgsmål ${index + 1} af ${questions.length}`;
  progress.max = questions.length;
  progress.value = index;
  back.disabled = sending || index === 0;
  next.disabled = sending;
  next.textContent = sending
    ? "Sender…"
    : index === steps.length - 1
      ? "Send endelig indmeldelsen →"
      : "Næste →";
  if (focus) steps[index].title.focus();
}

function validate(index) {
  const input = steps[index].input;
  input.setCustomValidity("");
  if (input.required && !input.value.trim())
    input.setCustomValidity("Vi insisterer desværre på et svar her.");
  return input.reportValidity();
}
steps.forEach(({ input }) =>
  input.addEventListener("input", () => input.setCustomValidity("")),
);
back.addEventListener("click", () => {
  if (!sending && current > 0) show(current - 1);
});
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (sending || !validate(current)) return;
  if (current < steps.length - 1) {
    show(current + 1);
    return;
  }
  // Recheck everything before sending, even if a field was edited after returning.
  for (let i = 0; i < steps.length; i++) {
    if (!steps[i].input.checkValidity()) {
      show(i);
      validate(i);
      return;
    }
  }
  sending = true;
  show(current, false);
  try {
    const result = await submitSignup(form);
    if (!result.ok) {
      const invalid = questions.findIndex(
        (question) => result.fields?.[question.name],
      );
      if (invalid >= 0) show(invalid);
      status.textContent =
        Object.values(result.fields || {}).join(" ") ||
        result.error ||
        "Noget gik galt. Prøv igen.";
      return;
    }
    form.hidden = true;
    progress.value = questions.length;
    count.textContent = "Spørgeundersøgelsen er omsider slut.";
    const success = document.querySelector("#success");
    success.textContent = `Tak for din tålmodighed (og din kartoffel). ${result.message}`;
    success.hidden = false;
    success.focus();
  } catch {
    status.textContent =
      "Serveren svarer ikke. Dine svar er stadig her. Prøv at sende igen.";
  } finally {
    sending = false;
    back.disabled = current === 0;
    next.disabled = false;
    next.textContent =
      current === steps.length - 1 ? "Send endelig indmeldelsen →" : "Næste →";
  }
});
show(0, false);
document.querySelector("#survey").hidden = false;
