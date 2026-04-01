export interface Env {
  GITHUB_TOKEN: string;
}

export function getToken(env: Env): string {
  return env.GITHUB_TOKEN;
}
