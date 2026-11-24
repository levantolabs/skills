import { createPost } from "./posts.js";

// Hooks are registered here at startup.

const post = await createPost("u1", "t1", "Hello everyone, first post!");
console.log(post.status);
