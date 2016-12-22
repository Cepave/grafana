all: bin

bin:
	go run build.go setup
	godep restore
	go get github.com/toolkits/file
	go build .
