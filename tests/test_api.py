import time

import requests
from fastapi.testclient import TestClient

from api import jobs
from api.main import app

client = TestClient(app)

PAYLOAD = {"name": "StyliApp", "audience": "Couturiers", "problem": "Commandes difficiles",
           "value_proposition": "Centraliser les commandes", "features": ["Suivi", ""]}


class FakeOllama:
    def __init__(self, *a, **k):
        self.model = "test-model"

    def check_connection(self):
        pass

    def generate_json(self, prompt, retries=2):
        if "Décompose ce produit" in prompt:
            return {"tasks": [{"task": "Organiser les commandes", "weight": 5, "why_it_matters": "x"},
                              {"task": "Rédiger un message", "weight": 1, "why_it_matters": "y"}]}
        return {"evaluations": [
            {"i": 1, "capability": 35, "autonomy": "faible", "limitation": "Stockage persistant"},
            {"i": 2, "capability": 90, "autonomy": "élevée", "limitation": "Aucune"},
        ]}


def wait(job_id):
    for _ in range(50):
        data = client.get(f"/api/analyze/{job_id}").json()
        if data["status"] != "running":
            return data
        time.sleep(0.05)
    raise AssertionError("timeout")


def test_health_and_config():
    assert client.get("/api/health").json() == {"status": "ok"}
    cfg = client.get("/api/config").json()
    assert cfg["model"] and "ollama_url" not in cfg


def test_validation_rejects_missing_fields():
    r = client.post("/api/analyze", json={"name": "x"})
    assert r.status_code == 422


def test_full_analysis(monkeypatch):
    monkeypatch.setattr(jobs, "OllamaClient", FakeOllama)
    r = client.post("/api/analyze", json=PAYLOAD)
    assert r.status_code == 202
    data = wait(r.json()["id"])
    assert data["status"] == "done"
    res = data["result"]
    assert res["product"]["features"] == ["Suivi"]
    # (5*35 + 1*90) / 6 = 44.2
    assert res["score"] == {"ai_coverage": 44.2, "gap": 55.8}
    assert [o["task"] for o in res["monetization_opportunities"]] == ["Organiser les commandes"]
    assert data["progress"]["tasks_done"] == data["progress"]["tasks_total"] == 2
    assert all(s["status"] == "done" for s in data["progress"]["steps"])


def test_ollama_unreachable(monkeypatch):
    class Down(FakeOllama):
        def check_connection(self):
            raise requests.exceptions.ConnectionError("refused")
    monkeypatch.setattr(jobs, "OllamaClient", Down)
    data = wait(client.post("/api/analyze", json=PAYLOAD).json()["id"])
    assert data["status"] == "error"
    assert data["error"]["code"] == "ollama_unreachable"
    assert data["error"]["step"] == "connection"


def test_unknown_job():
    assert client.get("/api/analyze/nope").status_code == 404


def test_ollama_status_down(monkeypatch):
    def boom(*a, **k):
        raise requests.exceptions.ConnectionError("refused")
    monkeypatch.setattr("api.main.requests.get", boom)
    s = client.get("/api/ollama/status").json()
    assert s["connected"] is False and s["error"]["code"] == "ollama_unreachable"
