import matplotlib.pyplot as plt

x = [0, 8, 15, 21, 26, 30, 33]
y = [6, 5, 4, 3, 2, 1, 0]
labels = "ABCDEFG"

plt.plot(x, y, "o-b")
plt.scatter(x, y, color="red", zorder=5)
for xi, yi, text in zip(x, y, labels):
	plt.text(xi + 0.5, yi + 0.2, text)

plt.xlabel("Computers")
plt.ylabel("Printers")
plt.grid(True)
plt.show()

print("\nPrinters:")
for i in range(len(labels[:-1])):
	print(f"{labels[i]}-{labels[i+1]}: {abs((x[i+1]-x[i])/(y[i+1]-y[i])):.2f} computers")

print("\nComputers:")
for i in range(len(labels[:-1])):
	print(f"{labels[i]}-{labels[i+1]}: {abs((y[i+1]-y[i])/(x[i+1]-x[i])):.2f} printers")