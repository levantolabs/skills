export type Post = { id: string; authorId: string; threadId: string; body: string; status: "published" | "held" };

const posts: Post[] = [];

type BeforePublishHook = (post: Post) => Promise<Post>;
const beforePublish: BeforePublishHook[] = [];

export function registerBeforePublish(hook: BeforePublishHook) {
  beforePublish.push(hook);
}

export async function createPost(authorId: string, threadId: string, body: string): Promise<Post> {
  let post: Post = { id: crypto.randomUUID(), authorId, threadId, body, status: "published" };
  for (const hook of beforePublish) post = await hook(post);
  posts.push(post);
  return post;
}
