import { submitSignup } from './signup-client.js';

const canvas = document.getElementById('screen');
const terminal = new DumbTerminal();
const renderer = new CRTRenderer(canvas);
const fontSize = 22;
const lineHeight = 31;
let lastFrame = 0;

// Entries remain in page memory until the user explicitly confirms submission.
const signup = {
  fields: [
    { key: 'firstName', label: 'Fornavn(e)', placeholder: 'Ada', required: true },
    { key: 'lastName', label: 'Efternavn(e)', placeholder: 'Lovelace', required: true },
    { key: 'email', label: 'Email', placeholder: 'dig@internettet.dk', required: true, validate: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'Skriv en gyldig emailadresse.' },
    { key: 'street', label: 'Vejnavn og nr.', placeholder: 'Opfindergade 42', required: true },
    { key: 'postalCode', label: 'Postnummer', placeholder: '2200', required: true, validate: (v) => /^\d{4}$/.test(v) || 'Postnummer skal være fire cifre.' },
    { key: 'city', label: 'By', placeholder: 'København N', required: true },
    { key: 'birthDate', label: 'Fødselsdato (dd-mm-yyyy)', placeholder: '01-01-1990', required: true, validate: validBirthDate },
    { key: 'phone', label: 'Telefon nr.', placeholder: '+45 12 34 56 78', required: true },
    { key: 'membership', label: 'Medlemskab (almindelig / studie)', placeholder: 'almindelig', required: true, validate: (v) => ['almindelig', 'ordinary', 'studie', 'student'].includes(v.toLowerCase()) || 'Skriv almindelig eller studie.' },
    { key: 'message', label: 'Evt. besked (valgfri, skriv - for at springe over)', placeholder: 'Hvad nørder du med?', required: false },
  ],
  answers: {},
  index: 0,
  state: 'welcome',
};

function validBirthDate(value) {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
  if (!match) return 'Brug formatet dd-mm-yyyy.';
  const [, dd, mm, yyyy] = match.map(Number);
  const date = new Date(yyyy, mm - 1, dd);
  const valid = date.getFullYear() === yyyy && date.getMonth() === mm - 1 && date.getDate() === dd;
  if (!valid) return 'Datoen ser ikke gyldig ud. Brug dd-mm-yyyy.';
  return date <= new Date() ? true : 'Fødselsdatoen må ikke ligge i fremtiden.';
}

function askCurrent() {
  const field = signup.fields[signup.index];
  terminal.writeln('');
  terminal.writeln(`${signup.index + 1}/${signup.fields.length}  ${field.label}${field.required ? ' *' : ''}`);
  if (field.placeholder) terminal.writeln(`Eksempel: ${field.placeholder}`);
}

function startSignup() {
  signup.answers = {};
  signup.index = 0;
  signup.state = 'collecting';
  terminal.writeln('');
  terminal.writeln('Indmeldelse hos hal9k');
  terminal.writeln('Felter markeret * er obligatoriske.');
  terminal.writeln('Skriv /afslut når som helst for at stoppe.');
  askCurrent();
}

function showReview() {
  signup.state = 'review';
  terminal.writeln('');
  terminal.writeln('Gennemse dine svar:');
  signup.fields.forEach((field, index) => {
    const value = signup.answers[field.key] || '(ikke angivet)';
    terminal.writeln(`  ${index + 1}. ${field.label}: ${value}`);
  });
  terminal.writeln('');
  terminal.writeln('Skriv EDIT <nr> for at rette et felt, JA for at sende, RET forfra eller /afslut.');
  terminal.writeln('Ved JA sendes oplysningerne til serveren, hvor de logges. Brug testdata.');
}

async function sendSignup() {
  signup.state = 'sending';
  terminal.writeln('');
  terminal.writeln('Sender indmeldelsen…');
  const payload = { ...signup.answers };
  payload.membership = ['studie', 'student'].includes(payload.membership.toLowerCase()) ? 'student' : 'ordinary';
  try {
    const result = await submitSignup(payload);
    if (!result.ok) {
      const fieldKey = Object.keys(result.fields || {})[0];
      if (fieldKey) {
        const fieldIndex = signup.fields.findIndex((field) => field.key === fieldKey);
        if (fieldIndex >= 0) {
          signup.index = fieldIndex;
          signup.state = 'editing';
          terminal.writeln(result.fields[fieldKey]);
          terminal.writeln(`Ret ${signup.fields[fieldIndex].label}. Skriv /tilbage for at beholde svaret.`);
          return;
        }
      }
      signup.state = 'review';
      terminal.writeln(result.error || 'Indmeldelsen kunne ikke sendes. Prøv igen senere.');
      terminal.writeln('Skriv JA for at prøve igen, EDIT <nr> for at rette eller /afslut.');
      return;
    }
    signup.answers = {};
    signup.state = 'welcome';
    terminal.writeln(result.message || 'Indmeldelsen er modtaget. Tak!');
    terminal.writeln('Oplysningerne logges på serveren. Brug testdata.');
  } catch {
    signup.state = 'review';
    terminal.writeln('Forbindelsen fejlede. Dine svar er stadig på denne side.');
    terminal.writeln('Skriv JA for at prøve igen, EDIT <nr> for at rette eller /afslut.');
  }
}

function handleInput(input) {
  const value = input.trim();
  if (signup.state === 'sending') return;
  if (signup.state === 'welcome') {
    if (value.toLowerCase() === 'help') {
      terminal.writeln('Skriv INDMELD for at starte, eller HELP for hjælp.');
    } else if (['indmeld', 'signup', 'start'].includes(value.toLowerCase())) {
      startSignup();
    } else if (value.toLowerCase() === 'clear') {
      terminal.clear();
    } else if (value.toLowerCase() === 'date') {
      terminal.writeln(new Date().toLocaleString('da-DK'));
    } else if (value.toLowerCase().startsWith('echo ')) {
      terminal.writeln(value.slice(5));
    } else if (value) {
      terminal.writeln('Ukendt kommando. Skriv INDMELD for at begynde eller HELP for hjælp.');
    }
    return;
  }

  if (value.toLowerCase() === '/afslut') {
    signup.state = 'welcome';
    signup.answers = {};
    terminal.writeln('Indmeldelsen er afbrudt. Ingen oplysninger blev gemt.');
    return;
  }

  if (signup.state === 'collecting') {
    const field = signup.fields[signup.index];
    if (!value && field.required) {
      terminal.writeln('Dette felt er obligatorisk. Prøv igen.');
      askCurrent(); return;
    }
    if (field.validate && value) {
      const valid = field.validate(value);
      if (valid !== true) { terminal.writeln(valid); askCurrent(); return; }
    }
    signup.answers[field.key] = field.key === 'message' && value === '-' ? '' : value;
    signup.index += 1;
    if (signup.index === signup.fields.length) showReview();
    else askCurrent();
    return;
  }

  if (signup.state === 'review') {
    const edit = /^edit\s+(\d+)$/i.exec(value);
    if (edit) {
      const fieldIndex = Number(edit[1]) - 1;
      if (fieldIndex < 0 || fieldIndex >= signup.fields.length) {
        terminal.writeln(`Vælg et felt fra 1 til ${signup.fields.length}.`);
        return;
      }
      signup.index = fieldIndex;
      signup.state = 'editing';
      const field = signup.fields[fieldIndex];
      terminal.writeln(`Ret ${field.label} (nuværende: ${signup.answers[field.key] || '(ikke angivet)'}).`);
      terminal.writeln('Skriv den nye værdi, eller skriv /tilbage for at beholde den nuværende.');
    } else if (value.toLowerCase() === 'ja') {
      sendSignup();
    } else if (value.toLowerCase() === 'ret') {
      startSignup();
    } else {
      terminal.writeln('Skriv EDIT <nr> for at rette et felt, JA for at afslutte, RET forfra eller /afslut.');
    }
    return;
  }

  if (signup.state === 'editing') {
    if (value.toLowerCase() === '/tilbage') {
      signup.state = 'review';
      showReview();
      return;
    }
    const field = signup.fields[signup.index];
    if (!value && field.required) {
      terminal.writeln('Dette felt er obligatorisk. Prøv igen eller skriv /tilbage.');
      return;
    }
    if (field.validate && value) {
      const valid = field.validate(value);
      if (valid !== true) {
        terminal.writeln(valid);
        terminal.writeln('Prøv igen eller skriv /tilbage for at beholde den nuværende værdi.');
        return;
      }
    }
    signup.answers[field.key] = field.key === 'message' && value === '-' ? '' : value;
    showReview();
  }
}

terminal.writeln('HAL9K // TERMINAL FOR INDMELDELSE');
terminal.writeln('----------------------------------');
terminal.writeln('Velkommen! Her kan du begynde indmeldelsen.');
terminal.writeln('Brug testdata: bekræftede oplysninger sendes og logges på serveren.');
terminal.writeln('Intet sendes, før du bekræfter med JA på gennemgangsskærmen.');
terminal.writeln('Skriv INDMELD for at begynde eller HELP for hjælp.');
terminal.writeln('');

terminal.onSubmit = handleInput;

function drawTerminal(ctx, width, height) {
  ctx.fillStyle = '#071008';
  ctx.fillRect(0, 0, width, height);
  ctx.font = `${fontSize}px "Courier New", monospace`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#b7dca1';
  ctx.shadowColor = '#8aff55';
  ctx.shadowBlur = 7;
  const cols = Math.max(12, Math.floor((width - 48) / (fontSize * 0.61)));
  const wrapped = [];
  for (const line of terminal.lines) {
    if (!line) { wrapped.push(''); continue; }
    for (let i = 0; i < line.length; i += cols) wrapped.push(line.slice(i, i + cols));
  }
  // Keep the command/input row pinned at the bottom of the display. History
  // scrolls in the area above it and can never push the active prompt around.
  const promptY = Math.max(24, height - lineHeight - 18);
  const visibleRows = Math.max(0, Math.floor((promptY - 24) / lineHeight));
  const output = wrapped.slice(-visibleRows);
  let y = promptY - output.length * lineHeight;
  for (const line of output) {
    ctx.fillText(line, 24, y);
    y += lineHeight;
  }
  const prompt = `> ${terminal.input}`;
  ctx.fillText(prompt, 24, promptY);
  if (Math.floor(performance.now() / 500) % 2 === 0) {
    const cursorX = 24 + ctx.measureText(prompt).width + 1;
    ctx.fillRect(cursorX, promptY + 2, 10, fontSize + 2);
  }
  ctx.shadowBlur = 0;
}

function frame(now) {
  if (now - lastFrame > 30) {
    renderer.render(drawTerminal, now / 1000);
    lastFrame = now;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

canvas.addEventListener('pointerdown', () => canvas.focus());
canvas.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') {
    terminal.clear(); event.preventDefault(); return;
  }
  if (event.key === 'Enter') {
    terminal.submit({ echo: signup.state === 'welcome' }); event.preventDefault();
  } else if (event.key === 'Backspace') {
    terminal.input = terminal.input.slice(0, -1);
    terminal.onChange(); event.preventDefault();
  } else if (event.key === 'Tab') {
    terminal.input += '  '; event.preventDefault();
  } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
    terminal.input += event.key; terminal.onChange();
  }
});
canvas.focus();
