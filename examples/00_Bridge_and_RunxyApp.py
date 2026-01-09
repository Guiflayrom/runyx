from runyx_bridge import RunyxApp, receive

@receive("/receive")
def receive_anything(payload, meta):
    print("\n[RECEIVE]", payload)
    return "ok"

def main():
    app = RunyxApp(
        requests=True,
        websocket=True,
        on_background=False,
        import_project_path="my-first-project-project.json"
    )
    app.start()

if __name__ == "__main__":
    main()
