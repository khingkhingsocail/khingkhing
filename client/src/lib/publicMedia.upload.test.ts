import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getOwnedPublicTokens,
  PUBLIC_UPLOAD_CHUNK_BYTES,
  PublicUploadSessionExpiredError,
  publicUploadFileError,
  uploadPublicMedia,
} from "./publicMedia";

vi.mock("./sessionToken", () => ({
  previewSessionToken: () => "session-token-for-test",
}));

const uploadToken = "u".repeat(43);
const deleteToken = uploadToken;
const postId = "a".repeat(32);
const fileContents = new Uint8Array(PUBLIC_UPLOAD_CHUNK_BYTES + 1);
fileContents[0] = 1;
fileContents[fileContents.length - 1] = 5;
const apiResult = {
  item: {
    id: postId,
    title: "Study",
    description: "Test post",
    kind: "image" as const,
    mimeType: "image/jpeg",
    size: fileContents.length,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  deleteToken,
};

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function headersFrom(init?: RequestInit) {
  return new Headers(init?.headers);
}

function makeStorage(
  options: { failReads?: boolean; failWrites?: boolean } = {}
) {
  const values = new Map<string, string>();
  return {
    values,
    storage: {
      getItem: vi.fn((key: string) => {
        if (options.failReads) throw new Error("storage read blocked");
        return values.get(key) ?? null;
      }),
      setItem: vi.fn((key: string, value: string) => {
        if (options.failWrites) throw new Error("storage write blocked");
        values.set(key, value);
      }),
    },
  };
}

function makeFile() {
  return new File([fileContents], "study.jpg", {
    type: "image/jpeg",
    lastModified: 1,
  });
}

function installWindow(
  localStorage: ReturnType<typeof makeStorage>["storage"]
) {
  vi.stubGlobal("window", {
    localStorage,
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  });
}

function uploadSessionResponse() {
  return jsonResponse(201, {
    id: postId,
    token: uploadToken,
    chunkBytes: PUBLIC_UPLOAD_CHUNK_BYTES,
  });
}

describe("public media chunk uploads", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reexports validation that accepts aliases and an empty MIME type with a supported extension", () => {
    expect(
      publicUploadFileError({ size: 5, type: "image/jpg", name: "asset.bin" })
    ).toBe("");
    expect(
      publicUploadFileError({ size: 5, type: "", name: "asset.heic" })
    ).toBe("");
    expect(
      publicUploadFileError({ size: 0, type: "image/jpeg", name: "asset.jpg" })
    ).toContain("ไฟล์ว่าง");
  });

  it("sends JSON session metadata, sequential raw chunks, and a completion request", async () => {
    const { storage } = makeStorage();
    installWindow(storage);
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requests.push({ url, init });
        if (url === "/api/media/uploads") return uploadSessionResponse();
        if (url.includes("/chunks/"))
          return new Response(null, { status: 204 });
        if (url.endsWith("/complete")) return jsonResponse(201, apiResult);
        return jsonResponse(404, { error: "unexpected request" });
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadPublicMedia(
      makeFile(),
      " Study ",
      " Test post ",
      false
    );

    expect(result.item.id).toBe(postId);
    expect(requests.map(request => request.url)).toEqual([
      "/api/media/uploads",
      `/api/media/uploads/${postId}/chunks/0`,
      `/api/media/uploads/${postId}/chunks/1`,
      `/api/media/uploads/${postId}/complete`,
    ]);
    const create = requests[0];
    expect(headersFrom(create.init).get("X-Khing-Upload")).toBe("1");
    expect(headersFrom(create.init).get("X-Khing-Media-Account")).toBeNull();
    expect(headersFrom(create.init).get("Authorization")).toBe(
      "Bearer session-token-for-test"
    );
    expect(create.init?.credentials).toBe("include");
    expect(JSON.parse(String(create.init?.body))).toEqual({
      title: "Study",
      description: "Test post",
      filename: "study.jpg",
      size: fileContents.length,
      mimeType: "image/jpeg",
    });
    for (const [index, request] of requests.slice(1, 3).entries()) {
      expect(headersFrom(request.init).get("Content-Type")).toBe(
        "application/octet-stream"
      );
      expect(headersFrom(request.init).get("X-Khing-Upload")).toBe("1");
      expect(headersFrom(request.init).get("X-Upload-Token")).toBe(uploadToken);
      const body = await (request.init?.body as Blob).arrayBuffer();
      expect(body.byteLength).toBe(index === 0 ? PUBLIC_UPLOAD_CHUNK_BYTES : 1);
    }
    expect(headersFrom(requests[3].init).get("X-Upload-Token")).toBe(
      uploadToken
    );
    expect(getOwnedPublicTokens()[postId]).toBe(deleteToken);
  });

  it("retries one transient chunk, resumes the same session, and repeats completion safely", async () => {
    const { storage } = makeStorage();
    installWindow(storage);
    const requests: string[] = [];
    let chunkOneCalls = 0;
    let completeCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);
      if (url === "/api/media/uploads") return uploadSessionResponse();
      if (url.endsWith("/chunks/0")) return new Response(null, { status: 204 });
      if (url.endsWith("/chunks/1")) {
        chunkOneCalls += 1;
        return chunkOneCalls <= 2
          ? jsonResponse(503, { error: "temporary failure" })
          : new Response(null, { status: 204 });
      }
      if (url.endsWith("/complete")) {
        completeCalls += 1;
        return completeCalls === 1
          ? jsonResponse(503, { error: "temporary completion failure" })
          : jsonResponse(200, apiResult);
      }
      return jsonResponse(404, { error: "unexpected request" });
    });
    vi.stubGlobal("fetch", fetchMock);
    const file = makeFile();

    await expect(
      uploadPublicMedia(file, "Study", "Test post", false)
    ).rejects.toThrow("temporary failure");
    expect(requests.filter(url => url === "/api/media/uploads")).toHaveLength(
      1
    );
    expect(requests.filter(url => url.endsWith("/chunks/0"))).toHaveLength(1);
    expect(requests.filter(url => url.endsWith("/chunks/1"))).toHaveLength(2);

    await expect(
      uploadPublicMedia(file, "Study", "Test post", false)
    ).rejects.toThrow("temporary completion failure");
    expect(requests.filter(url => url === "/api/media/uploads")).toHaveLength(
      1
    );
    expect(requests.filter(url => url.endsWith("/chunks/0"))).toHaveLength(1);
    expect(requests.filter(url => url.endsWith("/chunks/1"))).toHaveLength(3);

    const completed = await uploadPublicMedia(
      file,
      "Study",
      "Test post",
      false
    );
    expect(completed.item.id).toBe(postId);
    expect(requests.filter(url => url === "/api/media/uploads")).toHaveLength(
      1
    );
    expect(requests.filter(url => url.endsWith("/complete"))).toHaveLength(2);
    expect(requests.filter(url => url.includes("/chunks/"))).toHaveLength(4);
  });

  it("allows account uploads when localStorage is unavailable", async () => {
    const { storage } = makeStorage({ failReads: true, failWrites: true });
    installWindow(storage);
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requests.push({ url, init });
        if (url === "/api/media/uploads") return uploadSessionResponse();
        if (url.includes("/chunks/"))
          return new Response(null, { status: 204 });
        if (url.endsWith("/complete")) return jsonResponse(201, apiResult);
        return jsonResponse(404, { error: "unexpected request" });
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadPublicMedia(
      makeFile(),
      "Study",
      "Test post",
      true
    );

    expect(result.item.id).toBe(postId);
    expect(headersFrom(requests[0].init).get("X-Khing-Media-Account")).toBe(
      "1"
    );
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("keeps a guest delete token in memory if storage fails after publication without deleting the post", async () => {
    let failWrites = false;
    const values = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        if (failWrites) throw new Error("storage write blocked");
        values.set(key, value);
      }),
    };
    installWindow(storage);
    const requests: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);
      if (url === "/api/media/uploads") return uploadSessionResponse();
      if (url.includes("/chunks/")) return new Response(null, { status: 204 });
      if (url.endsWith("/complete")) {
        failWrites = true;
        return jsonResponse(201, apiResult);
      }
      return jsonResponse(404, { error: "unexpected request" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadPublicMedia(
      makeFile(),
      "Study",
      "Test post",
      false
    );

    expect(result.localCapabilityWarning).toContain("โพสต์เผยแพร่แล้ว");
    expect(result.localCapabilityWarning).not.toContain(deleteToken);
    expect(getOwnedPublicTokens()[postId]).toBe(deleteToken);
    expect(requests.some(url => url.includes("DELETE"))).toBe(false);
    expect(requests.some(url => url === `/api/media/${postId}`)).toBe(false);
  });

  it("drops an expired session and reports that the user must reselect the file", async () => {
    const { storage } = makeStorage();
    installWindow(storage);
    let sessionCount = 0;
    let chunkCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/media/uploads") {
        sessionCount += 1;
        return uploadSessionResponse();
      }
      if (url.includes("/chunks/")) {
        chunkCalls += 1;
        return chunkCalls === 1
          ? jsonResponse(410, { error: "expired" })
          : new Response(null, { status: 204 });
      }
      if (url.endsWith("/complete")) return jsonResponse(201, apiResult);
      return jsonResponse(404, { error: "unexpected request" });
    });
    vi.stubGlobal("fetch", fetchMock);
    const file = makeFile();

    await expect(
      uploadPublicMedia(file, "Study", "Test post", false)
    ).rejects.toBeInstanceOf(PublicUploadSessionExpiredError);
    expect(sessionCount).toBe(1);
    const completed = await uploadPublicMedia(
      file,
      "Study",
      "Test post",
      false
    );
    expect(completed.item.id).toBe(postId);
    expect(sessionCount).toBe(2);
  });
});
