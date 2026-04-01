export interface Env {
  TODOIST_TOKEN: string;
}

export function getToken(env: Env): string {
  return env.TODOIST_TOKEN;
}
