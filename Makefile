APP := seesound
BIN_DIR := bin
BIN := $(BIN_DIR)/$(APP)
PORT ?= 8787

.PHONY: install run dev fmt clean

install:
	@mkdir -p $(BIN_DIR)
	go build -o $(BIN) .
	@echo "Installed $(BIN)"
	@echo "Run with: make run"

run: install
	$(BIN) -port $(PORT)

dev:
	go run . -port $(PORT)

fmt:
	gofmt -w main.go

clean:
	rm -rf $(BIN_DIR)
