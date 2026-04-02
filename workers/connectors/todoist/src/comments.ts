import type { Env } from "./auth.ts";
import { syncRead, syncWrite } from "./todoist-fetch.ts";

interface SyncNote {
  id: string;
  item_id: string;
  content: string;
  posted_at: string;
  is_deleted: boolean;
}

export async function handleCommentsList(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    taskId?: string;
  };

  const { data, error } = await syncRead(env, ["notes"]);
  if (error) return error;

  let notes = ((data!.notes as SyncNote[]) || []).filter((n) => !n.is_deleted);

  if (body.taskId) {
    notes = notes.filter((n) => n.item_id === body.taskId);
  }

  return Response.json({
    comments: notes.map((n) => ({
      id: n.id,
      taskId: n.item_id,
      content: n.content,
      postedAt: n.posted_at,
    })),
  });
}

export async function handleCommentsCreate(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    content: string;
    taskId: string;
  };

  if (!body.content || !body.taskId) {
    return Response.json(
      { error: "content and taskId are required" },
      { status: 400 },
    );
  }

  const tempId = crypto.randomUUID();
  const { data, error } = await syncWrite(env, [
    {
      type: "note_add",
      uuid: crypto.randomUUID(),
      temp_id: tempId,
      args: { item_id: body.taskId, content: body.content },
    },
  ]);
  if (error) return error;

  const realId = data!.temp_id_mapping[tempId] || tempId;
  return Response.json({ comment: { id: realId, ok: true } });
}
