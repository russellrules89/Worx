from flask import Flask, jsonify

app = Flask(__name__)


@app.get("/")
def home():
    return jsonify(
        service="worx",
        status="ok",
        message="The Worx service is online.",
    )


@app.get("/health")
def health():
    return jsonify(status="ok"), 200


@app.get("/favicon.ico")
@app.get("/favicon.png")
def favicon():
    return "", 204
