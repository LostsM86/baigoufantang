package main

import (
	"fmt"
	"log"
	"net/http"
	"wxcloudrun-golang/db"
	"wxcloudrun-golang/service"
)

func main() {
	if err := db.Init(); err != nil {
		panic(fmt.Sprintf("mysql init failed with %+v", err))
	}

	http.HandleFunc("/", service.IndexHandler)
	http.HandleFunc("/api/count", service.CounterHandler)
	http.HandleFunc("/api/bootstrap", service.BootstrapHandler)
	http.HandleFunc("/api/orders/batch", service.OrderBatchHandler)
	http.HandleFunc("/api/orders/action", service.OrderActionHandler)
	http.HandleFunc("/api/admin/bootstrap", service.AdminBootstrapHandler)
	http.HandleFunc("/api/admin/categories", service.AdminCategoryHandler)
	http.HandleFunc("/api/admin/menu-items", service.AdminMenuItemHandler)
	http.HandleFunc("/api/admin/orders/action", service.AdminOrderActionHandler)

	log.Fatal(http.ListenAndServe(":80", nil))
}
