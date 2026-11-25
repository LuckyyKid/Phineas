using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Phineas.Data.Migrations
{
    /// <inheritdoc />
    public partial class AjoutVehiculesEnvisages : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "VehiculesEnvisages",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySql:ValueGenerationStrategy", MySqlValueGenerationStrategy.IdentityColumn),
                    OpportuniteId = table.Column<int>(type: "int", nullable: false),
                    Marque = table.Column<string>(type: "varchar(40)", maxLength: 40, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    Modele = table.Column<string>(type: "varchar(60)", maxLength: 60, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    Annee = table.Column<int>(type: "int", nullable: true),
                    Finition = table.Column<string>(type: "varchar(60)", maxLength: 60, nullable: true)
                        .Annotation("MySql:CharSet", "utf8mb4")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VehiculesEnvisages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_VehiculesEnvisages_OpportunitesVente_OpportuniteId",
                        column: x => x.OpportuniteId,
                        principalTable: "OpportunitesVente",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_VehiculesEnvisages_OpportuniteId",
                table: "VehiculesEnvisages",
                column: "OpportuniteId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "VehiculesEnvisages");
        }
    }
}
