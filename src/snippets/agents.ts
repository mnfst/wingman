// Snippets for the personal-agent clients. Both configure a CLI rather than
// call an SDK, so they're shell-shaped: the key goes into a config file or a
// `config set` call, not a constructor.
import { envHint, keyInline, type SnippetContext } from './context';

/**
 * OpenClaw's provider config is a single-quoted JSON blob. A hidden key can't
 * just sit inside it (single quotes stop the shell expanding `$VAR`), so the
 * quote is closed around the reference and reopened after it, which is the
 * standard `'…'"$VAR"'…'` splice.
 */
export function openclawSnippet(ctx: SnippetContext): string {
  const p = ctx.params;
  const key = ctx.key.hidden ? `'"$${ctx.key.envName}"'` : keyInline(ctx);
  return `${envHint(ctx)}# OpenClaw routes through its built-in OpenAI-compatible client.
# Configure once with the CLI:
openclaw config set models.providers.manifest '{"baseUrl":"${p.baseUrl}/v1","api":"openai-completions","apiKey":"${key}","models":[{"id":"${p.model}","name":"Manifest Auto"}]}'
openclaw config set agents.defaults.model.primary manifest/${p.model}
openclaw gateway restart`;
}

/**
 * Hermes reads a YAML config. The heredoc is unquoted (`<<EOF`), so the shell
 * expands `$VAR` inside it and a hidden key needs no extra quoting.
 */
export function hermesSnippet(ctx: SnippetContext): string {
  const p = ctx.params;
  return `${envHint(ctx)}# Hermes reads its provider from ~/.hermes/config.yaml:
cat <<EOF > ~/.hermes/config.yaml
model:
  provider: custom
  base_url: ${p.baseUrl}/v1
  api_key: ${keyInline(ctx)}
  default: ${p.model}
EOF
hermes chat -q '${p.userMessage.replace(/'/g, "'\\''")}'`;
}
