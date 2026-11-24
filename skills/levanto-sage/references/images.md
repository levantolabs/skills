# Images (beta)

Yes/No, Choice, Scale and Tags accept an image as `content`, on `/decide` and per group in `/decide/batch`.

```json
{"content": {"kind": "image", "media": "data:image/png;base64,<base64 bytes>", "text": "Ticket: checkout button missing on mobile."},
 "question": {"id": "shows_bug", "kind": "yesno", "instructions": "Does the screenshot show the reported problem?"}}
```

- `media`: a base64 `data:` URI, PNG, JPEG or WebP. Up to 4 MiB decoded, longest edge 8192 px, at most 4096² pixels. Remote URLs and file paths are not accepted: read the file and encode it.
- `text` (optional): context to judge the image with.
- Not with Sort, list items, `grounding`, or more than 20 Choice options (`400`).
- On images, Tags always return `true` or `false`.
- Image tokens count as input (`meta.usage.image_tokens`).

```python
import base64, pathlib
media = "data:image/png;base64," + base64.b64encode(pathlib.Path("shot.png").read_bytes()).decode()
```
