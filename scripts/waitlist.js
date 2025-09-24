const SUPABASE_URL = 'https://tvkgbujmcoctnnqsolxr.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2a2didWptY29jdG5ucXNvbHhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2NTU2ODAsImV4cCI6MjA3NDIzMTY4MH0.wqP6A1YTFWsMhKPea_z9M6hOXAvGNialHbLAKLg99ds';

const createClient = window.supabase?.createClient;
let supabaseClient = null;

if (typeof createClient === 'function') {
  supabaseClient = createClient(SUPABASE_URL, ANON_KEY);
}

const forms = document.querySelectorAll('.waitlist-form');

const setStatusMessage = (form, message, variant = 'info') => {
  const error = form.querySelector('.form-error');
  if (!error) return;

  error.textContent = message;
  error.dataset.variant = variant;
};

const handleSubmit = async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const emailInput = form.querySelector('input[type="email"]');
  const honeypotInput = form.querySelector('input[name="website"]');

  setStatusMessage(form, '');

  if (honeypotInput && honeypotInput.value) {
    return;
  }

  if (!emailInput || !emailInput.value.trim()) {
    setStatusMessage(form, 'Please enter an email address.', 'error');
    emailInput?.focus();
    return;
  }

  if (!emailInput.checkValidity()) {
    setStatusMessage(form, 'Please provide a valid email address.', 'error');
    emailInput.focus();
    return;
  }

  if (!supabaseClient) {
    setStatusMessage(form, 'Unable to submit right now. Please try again shortly.', 'error');
    return;
  }

  try {
    const trimmedEmail = emailInput.value.trim();
    const { error: supabaseError } = await supabaseClient
      .from('waitlist')
      .insert([{ email: trimmedEmail }], { ignoreDuplicates: true });

    if (supabaseError) {
      throw supabaseError;
    }

    form.reset();
    setStatusMessage(form, 'Thanks — you’re on the waitlist!', 'success');
  } catch (error) {
    console.error(error);
    setStatusMessage(form, 'Sorry, something went wrong. Please try again later.', 'error');
  }
};

forms.forEach((form) => {
  if (!form.dataset.enhanced) {
    form.dataset.enhanced = 'true';
    form.addEventListener('submit', handleSubmit);
  }
});

export {};
