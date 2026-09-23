import { describe, expect, it } from "vitest";
import { classifyQuestion } from "@/lib/ai/routing";
import {
  assembleMessages,
  buildVisualImagePrompt,
  cleanAnswer,
  extractSvgBlock,
  stripReasoningArtifacts,
} from "@/lib/ai/prompts";
import {
  buildEnergyFlowSvg,
  buildImageRequest,
  escapeXml,
  isEnergyFlowRequest,
  nullImageProvider,
  OpenAiCompatibleImageProvider,
  parseImageResponse,
  resolveImageProvider,
  resolveImageProviderConfig,
  sniffImageMime,
} from "@/lib/ai/visuals";

describe("classifyQuestion (smart routing)", () => {
  it("routes general concepts to general AI", () => {
    expect(classifyQuestion("What is MPPT?").route).toBe("general");
    expect(classifyQuestion("Explain how lithium-ion batteries work").route).toBe("general");
    expect(classifyQuestion("What is the difference between mono and polycrystalline panels?").route).toBe("general");
  });

  it("routes personal-data questions to UrjaOS data mode", () => {
    expect(classifyQuestion("What is my current battery SOC?").route).toBe("data");
    expect(classifyQuestion("How much did solar save me this week?").route).toBe("data");
    expect(classifyQuestion("How much energy did I use today?").route).toBe("data");
  });

  it("routes data + explanation questions to both", () => {
    expect(
      classifyQuestion("Why is my battery efficiency low and how can I improve it?").route
    ).toBe("both");
    expect(classifyQuestion("How can I reduce my electricity bill?").route).toBe("both");
  });

  it("keeps non-personal energy concepts general", () => {
    expect(classifyQuestion("How does net metering work?").route).toBe("general");
    expect(classifyQuestion("Write a python function to compute MAPE").route).toBe("general");
  });

  it("forces data analysis when the UI data-mode is on", () => {
    const decision = classifyQuestion("What is MPPT?", "data");
    expect(decision.route).toBe("both");
  });
});

describe("extractSvgBlock", () => {
  const VALID =
    '```svg\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 420"><rect width="760" height="420"/></svg>\n```';

  it("extracts a valid fenced svg block", () => {
    const svg = extractSvgBlock(`Here is a diagram:\n${VALID}\nEnjoy!`);
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });

  it("returns null when no svg block is present", () => {
    expect(extractSvgBlock("Just text, no diagram.")).toBeNull();
    expect(extractSvgBlock("```\nnot svg\n```")).toBeNull();
  });

  it("rejects unsafe svg (scripts, handlers, foreignObject)", () => {
    const evil = '```svg\n<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>\n```';
    const handler = '```svg\n<svg xmlns="http://www.w3.org/2000/svg" onclick="x()"></svg>\n```';
    const fo = '```svg\n<svg xmlns="http://www.w3.org/2000/svg"><foreignObject></foreignObject></svg>\n```';
    expect(extractSvgBlock(evil)).toBeNull();
    expect(extractSvgBlock(handler)).toBeNull();
    expect(extractSvgBlock(fo)).toBeNull();
  });

  it("rejects svg without the xmlns attribute", () => {
    const noXmlns = "```svg\n<svg viewBox=\"0 0 10 10\"></svg>\n```";
    expect(extractSvgBlock(noXmlns)).toBeNull();
  });
});

describe("stripReasoningArtifacts", () => {
  it("passes clean answers through unchanged", () => {
    expect(cleanAnswer("MPPT is a technique…")).toBe("MPPT is a technique…");
  });

  it("cuts to the final answer after leaked reasoning", () => {
    const leaked =
      "Here's a thinking process:\n\nThe user asks about MPPT. I should explain it simply.\n\nFinal answer: MPPT is a technique that maximizes panel output.";
    expect(cleanAnswer(leaked)).toBe("Final answer: MPPT is a technique that maximizes panel output.".replace("Final answer: ", ""));
  });
  it("returns empty when the reply is only leaked reasoning", () => {
    expect(stripReasoningArtifacts("Here's a thinking process:\nblah blah")).toBe("");
  });
});

describe("image provider capability detection", () => {
  it("reports unavailable when no image endpoint is configured", () => {
    const provider = resolveImageProvider({});
    expect(provider.available).toBe(false);
  });

  it("null provider never claims success", async () => {
    const result = await nullImageProvider.generate("a sun");
    expect(result.kind).toBe("image");
    expect(result.error).toBeTruthy();
    expect(result.dataUrl).toBeUndefined();
  });
});

describe("resolveImageProviderConfig (env-based selection)", () => {
  it("returns null unless BOTH endpoint and key are set", () => {
    expect(resolveImageProviderConfig({})).toBeNull();
    expect(
      resolveImageProviderConfig({ AI_IMAGE_BASE_URL: "https://api.example.com/v1" })
    ).toBeNull();
    expect(resolveImageProviderConfig({ AI_IMAGE_API_KEY: "k" })).toBeNull();
    expect(
      resolveImageProviderConfig({ AI_IMAGE_BASE_URL: "  ", AI_IMAGE_API_KEY: "k" })
    ).toBeNull();
  });

  it("applies safe defaults for model and size", () => {
    const config = resolveImageProviderConfig({
      AI_IMAGE_BASE_URL: "https://api.example.com/v1/",
      AI_IMAGE_API_KEY: "k",
    })!;
    expect(config.baseUrl).toBe("https://api.example.com/v1"); // trailing slash trimmed
    expect(config.model).toBe("gpt-image-1");
    expect(config.size).toBe("1024x1024");
  });

  it("env overrides win over defaults", () => {
    const config = resolveImageProviderConfig({
      AI_IMAGE_BASE_URL: "https://nim.example/v1",
      AI_IMAGE_API_KEY: "nvapi-x",
      AI_IMAGE_MODEL: "stabilityai/sdxl",
      AI_IMAGE_SIZE: "512x512",
    })!;
    expect(config.model).toBe("stabilityai/sdxl");
    expect(config.size).toBe("512x512");
  });
});

describe("buildImageRequest (OpenAI-compatible images contract)", () => {
  const config = resolveImageProviderConfig({
    AI_IMAGE_BASE_URL: "https://api.example.com/v1",
    AI_IMAGE_API_KEY: "secret-key",
  })!;

  it("targets /images/generations with a Bearer header", () => {
    const req = buildImageRequest(config, "a diagram of MPPT");
    expect(req.url).toBe("https://api.example.com/v1/images/generations");
    expect(req.headers.Authorization).toBe("Bearer secret-key");
    expect(req.headers["Content-Type"]).toBe("application/json");
  });

  it("keeps the request body minimal and prompt-carrying", () => {
    const req = buildImageRequest(config, "a diagram of MPPT");
    expect(req.body).toEqual({
      model: "gpt-image-1",
      prompt: "a diagram of MPPT",
      n: 1,
      size: "1024x1024",
    });
    // The key must never travel in the body.
    expect(JSON.stringify(req.body)).not.toContain("secret-key");
  });
});

describe("parseImageResponse", () => {
  it("accepts a b64_json payload (gpt-image-1 style)", () => {
    expect(parseImageResponse({ data: [{ b64_json: "aGk=" }] })).toEqual({ b64: "aGk=" });
  });

  it("accepts an http(s) url payload (dall-e style)", () => {
    expect(
      parseImageResponse({ data: [{ url: "https://cdn.example.com/img.png" }] })
    ).toEqual({ url: "https://cdn.example.com/img.png" });
    expect(() => parseImageResponse({ data: [{ url: "ftp://evil" }] })).toThrow();
  });

  it("throws on unreadable payloads", () => {
    expect(() => parseImageResponse(null)).toThrow();
    expect(() => parseImageResponse({})).toThrow();
    expect(() => parseImageResponse({ data: [] })).toThrow();
    expect(() => parseImageResponse({ data: [{}] })).toThrow();
  });
});

describe("sniffImageMime", () => {
  it("detects png/jpeg/gif/webp magic bytes", () => {
    expect(sniffImageMime("iVBORw0KGgoAAAANS")).toBe("image/png");
    expect(sniffImageMime("/9j/4AAQSkZJRg")).toBe("image/jpeg");
    expect(sniffImageMime("R0lGODlhAQAB")).toBe("image/gif");
    expect(sniffImageMime("UklGRh4AAABX")).toBe("image/webp");
  });

  it("falls back to png for unknown payloads", () => {
    expect(sniffImageMime("c2FtcGxl")).toBe("image/png");
  });
});

describe("OpenAiCompatibleImageProvider.generate (mocked fetch)", () => {
  const provider = new OpenAiCompatibleImageProvider({
    apiKey: "k",
    baseUrl: "https://api.example.com/v1",
    model: "test-model",
    size: "1024x1024",
  });

  it("returns a data URL on a b64_json success", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ data: [{ b64_json: "iVBORw0KGgo=" }] }), {
        status: 200,
      })) as unknown as typeof fetch;
    const result = await provider.generate("a sun", fetchImpl);
    expect(result.kind).toBe("image");
    expect(result.dataUrl).toBe("data:image/png;base64,iVBORw0KGgo=");
    expect(result.error).toBeUndefined();
  });

  it("maps auth failures to an honest, actionable error", async () => {
    const fetchImpl = (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
    const result = await provider.generate("a sun", fetchImpl);
    expect(result.dataUrl).toBeUndefined();
    expect(result.error).toContain("AI_IMAGE_API_KEY");
  });

  it("maps rate limits and other statuses without throwing", async () => {
    const rateLimited = (async () =>
      new Response("{}", { status: 429 })) as unknown as typeof fetch;
    expect((await provider.generate("a sun", rateLimited)).error).toContain("rate-limiting");

    const serverError = (async () =>
      new Response("{}", { status: 500 })) as unknown as typeof fetch;
    expect((await provider.generate("a sun", serverError)).error).toContain("500");
  });

  it("returns an error (never throws) when the endpoint is unreachable", async () => {
    const failing = (async () => {
      throw new TypeError("network down");
    }) as unknown as typeof fetch;
    const result = await provider.generate("a sun", failing);
    expect(result.dataUrl).toBeUndefined();
    expect(result.error).toContain("Could not reach");
  });
});

describe("isEnergyFlowRequest (data-visual intent)", () => {
  it("matches requests to see the user's own energy flows", () => {
    expect(isEnergyFlowRequest("Visualize my energy flow")).toBe(true);
    expect(isEnergyFlowRequest("show my energy flow")).toBe(true);
    expect(isEnergyFlowRequest("Draw the power flow for my system")).toBe(true);
    expect(isEnergyFlowRequest("Can I get a flow diagram?")).toBe(true);
  });

  it("does not match concept-diagram requests", () => {
    expect(isEnergyFlowRequest("Explain how MPPT works")).toBe(false);
    expect(isEnergyFlowRequest("Explain how solar panels charge a battery")).toBe(false);
    expect(isEnergyFlowRequest("Explain lithium-ion battery charging")).toBe(false);
  });
});

describe("buildVisualImagePrompt", () => {
  it("forbids depicted readings for concept visuals", () => {
    const prompt = buildVisualImagePrompt("How solar panels charge a battery", true);
    expect(prompt).toContain("do not depict any specific meter readings");
    expect(prompt).toContain("How solar panels charge a battery");
  });

  it("keeps data-mode rasters generic too", () => {
    const prompt = buildVisualImagePrompt("My battery charging stages", false);
    expect(prompt).toContain("do not invent specific numeric readings");
  });
});

describe("buildEnergyFlowSvg (real-data visualizer)", () => {
  it("renders values from the provided data", () => {
    const svg = buildEnergyFlowSvg({
      systemName: "Factory Alpha",
      solarKwh: 15266,
      consumptionKwh: 12000,
      gridImportKwh: 900,
      gridExportKwh: 2100,
      batteryChargeKwh: 3300,
      batteryDischargeKwh: 2900,
    });
    expect(svg).toContain("Factory Alpha");
    expect(svg).toContain("15,266 kWh");
    expect(svg).toContain("12,000 kWh");
    expect(svg).toContain("import 900 kWh / export 2,100 kWh");
    expect(svg).toContain("<svg");
  });

  it("renders n/a for missing values instead of inventing numbers", () => {
    const svg = buildEnergyFlowSvg({
      systemName: "Empty",
      solarKwh: null,
      consumptionKwh: null,
      gridImportKwh: null,
      gridExportKwh: null,
      batteryChargeKwh: null,
      batteryDischargeKwh: null,
    });
    expect(svg).not.toMatch(/\d{2,},?\d* kWh/); // no fabricated totals
    expect((svg.match(/n\/a/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });

  it("escapes xml-significant characters in the system name", () => {
    expect(escapeXml('<b>&"')).toBe("&lt;b&gt;&amp;&quot;");
    const svg = buildEnergyFlowSvg({
      systemName: 'A & B <test>',
      solarKwh: 1,
      consumptionKwh: 1,
      gridImportKwh: null,
      gridExportKwh: null,
      batteryChargeKwh: null,
      batteryDischargeKwh: null,
    });
    expect(svg).toContain("A &amp; B &lt;test&gt;");
    expect(svg).not.toContain("<test>");
  });
});

describe("assembleMessages", () => {
  it("uses the general prompt with no factual block for general route", () => {
    const messages = assembleMessages({
      route: "general",
      question: "What is MPPT?",
      contextBlock: null,
    });
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).not.toContain("FACTUAL DATA BLOCK");
    expect(messages[1]).toEqual({ role: "user", content: "What is MPPT?" });
  });

  it("includes the factual block for data routes", () => {
    const messages = assembleMessages({
      route: "data",
      question: "What is my SOC?",
      contextBlock: "- Battery: discharged 900 kWh",
    });
    expect(messages[0].content).toContain("FACTUAL DATA BLOCK");
    expect(messages[0].content).toContain("discharged 900 kWh");
  });

  it("trims history to the last 8 turns", () => {
    const history = Array.from({ length: 12 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `turn ${i}`,
    }));
    const messages = assembleMessages({
      route: "general",
      question: "next",
      contextBlock: null,
      history,
    });
    // system + 8 history + 1 question
    expect(messages).toHaveLength(10);
    expect(messages[1].content).toBe("turn 4");
    expect(messages[messages.length - 1].content).toBe("next");
  });
});
