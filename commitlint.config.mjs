export default {
  extends: ['@commitlint/config-conventional'],
  // Merge commits on the integration branch aren't Conventional Commits; skip them all, not just git's default wording.
  ignores: [(message) => message.startsWith('Merge ')],
};
