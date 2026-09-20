from fastapi import FastAPI

app = FastAPI(title="羽毛球双打小程序 API", version="1.0.0")

@app.get("/api/health")
def health():
    return {"ok": True}
