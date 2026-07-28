// Ralentissement progressif par IP, pas de blocage definitif : les
// premiers essais sont gratuits (une faute de frappe ne coute rien), puis
// chaque nouvel echec double le delai avant de pouvoir retenter, plafonne
// a quelques minutes. Un bot qui essaie en boucle s'ecroule vite ; un
// humain qui se trompe peut toujours reessayer, juste un peu plus tard.

const FREE_ATTEMPTS = 3;
const BASE_DELAY_MS = 5000;
const MAX_DELAY_MS = 5 * 60 * 1000;

function delayFor(failures) {
  if (failures <= FREE_ATTEMPTS) return 0;
  const exp = failures - FREE_ATTEMPTS - 1;
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** exp);
}

function createThrottle() {
  const attempts = new Map();

  return {
    secondsToWait(key) {
      const state = attempts.get(key);
      if (!state || state.failures === 0) return 0;
      const required = delayFor(state.failures);
      const elapsed = Date.now() - state.lastFailureAt;
      if (elapsed >= required) return 0;
      return Math.ceil((required - elapsed) / 1000);
    },
    recordFailure(key) {
      const state = attempts.get(key) || { failures: 0, lastFailureAt: 0 };
      state.failures += 1;
      state.lastFailureAt = Date.now();
      attempts.set(key, state);
    },
    recordSuccess(key) {
      attempts.delete(key);
    },
  };
}

module.exports = { createThrottle };
