import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "./app";

describe("API Integration", () => {
  it("GET /health returns 200", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("POST /api/enrich returns enriched prompt", async () => {
    const res = await request(app)
      .post("/api/enrich")
      .send({ message: "hello world" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("enrichedPrompt");
    expect(res.body.enrichedPrompt).toContain("User request:");
    expect(res.body.metadata).toBeDefined();
  });

  it("POST /api/chat valid request streams data", async () => {
    const res = await request(app)
      .post("/api/chat")
      .send({ finalPrompt: "System: Be nice.\n\nUser: Hello" })
      .expect("Content-Type", /text\/event-stream/);

    expect(res.status).toBe(200);
  });

  it("POST /api/chat invalid request returns 400", async () => {
    const res = await request(app)
      .post("/api/chat")
      .send({ finalPrompt: "" }); // too short
    
    expect(res.status).toBe(400);
  });
});
